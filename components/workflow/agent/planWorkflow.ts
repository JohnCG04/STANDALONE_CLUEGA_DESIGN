// The host's `sendMessage`. Planning is a job: the graph arrives on the job's stream, not the POST.

import {
  worthAsking,
  briefFrom,
  contextFrom,
  toAgentQuestions,
} from "./clarify";
import { DEFAULT_PLAN_COPY, DEFAULT_STEP_LABELS } from "./constants";
import { toJobEvent } from "./helpers";
import { createPlanEventMapper } from "./planEvents";
import { readSseFrames } from "./sseFrames";
import type {
  AgentQuestion,
  MediaTransport,
  PlanChunk,
  PlanWorkflowOptions,
  PlanWorkflowRequest,
  RoutedTurn,
  ThreadTurn,
} from "./types";

/**
 * Decide what this turn is, and stream the answer when it is a conversation.
 * The route frame arrives first, so a build stops reading without waiting for prose.
 */
async function* routeTurn(
  prompt: string,
  history: readonly ThreadTurn[],
  manifest: unknown,
  digest: unknown,
  images: readonly { node_id: string; url: string }[] | undefined,
  summary: string | undefined,
  transport: MediaTransport,
  signal?: AbortSignal,
  mode: "route" | "plan" = "route",
  /** Pin the whole turn to one model; the service's config decides when absent. */
  model?: string,
  /** Read by the service's ask rules: the cards to start from, and the question's language. */
  mentions?: readonly string[],
  locale?: string,
): AsyncGenerator<PlanChunk, RoutedTurn | null> {
  let res: Response;
  try {
    res = await transport.fetch(
      `${transport.baseUrl}/workflow/chat`,
      {
        method: "POST",
        body: JSON.stringify({
          prompt,
          // Sent whole: the caller already narrowed it to the window.
          history: history
            .filter((m) => m.text.trim())
            .map((m) => ({ role: m.role, content: m.text })),
          ...(summary ? { summary } : {}),
          ...(manifest ? { manifest } : {}),
          ...(digest ? { digest } : {}),
          ...(images?.length ? { images } : {}),
          ...(mode === "plan" ? { mode } : {}),
          ...(mentions?.length ? { mentions } : {}),
          ...(locale ? { locale } : {}),
          // Which controls this host mounted: the one part of the manual the service can't know.
          can_upload: true,
          can_run_all: true,
          // A pinned model pins the WHOLE turn, not only the graph.
          ...(model ? { model } : {}),
          stream: true,
        }),
        signal,
      },
      "text/event-stream",
    );
  } catch {
    // Unreachable means build: a user who meant to build still gets their graph.
    return null;
  }

  if (!res.ok || !res.body) return null;

  let route = "build";
  let reply = "";
  let nodes: string[] = [];
  let brief = "";
  let questions: AgentQuestion[] = [];
  let request = "";
  let needsImages = false;

  for await (const frame of readSseFrames(res.body, signal)) {
    let payload: {
      route?: string;
      delta?: string;
      message?: string;
      nodes?: string[];
      brief?: string;
      label?: string;
      request?: string;
      needs_images?: boolean;
      questions?: Parameters<typeof toAgentQuestions>[0];
    };
    try {
      payload = JSON.parse(frame.data);
    } catch {
      // One unreadable frame is not worth failing the turn over.
      continue;
    }

    if (frame.event === "route") {
      route = payload.route ?? "build";
      nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      request = payload.request ?? "";
      needsImages = payload.needs_images === true;
      // A build reads on: the questions frame, when there is one, follows this one.
      continue;
    }
    if (frame.event === "questions" && Array.isArray(payload.questions)) {
      questions = toAgentQuestions(payload.questions);
      continue;
    }
    if (frame.event === "text" && payload.delta) {
      reply += payload.delta;
      yield { type: "text", delta: payload.delta };
      continue;
    }
    // Streamed reasoning: prose that lands all at once after seconds of nothing reads as a hang.
    if (frame.event === "thinking" && payload.label) {
      yield { type: "thinking", label: payload.label };
      continue;
    }
    if (frame.event === "offer" && payload.brief) {
      brief = payload.brief;
      continue;
    }
    if (frame.event === "error") {
      // The words already shown stand; the turn just stops here.
      break;
    }
    if (frame.event === "done") break;
  }

  return { route, reply, nodes, brief, questions, request, needsImages };
}

/** Thrown when the submit itself fails — the stream never opens. */
export class PlanSubmitError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlanSubmitError";
  }
}

/**
 * Plan a workflow, yielding chunks the agent panel can draw.
 * Stream errors are yielded so the steps already shown survive; only a failed submit throws.
 */
export async function* planWorkflow(
  req: PlanWorkflowRequest,
  {
    transport,
    signal,
    labels = DEFAULT_STEP_LABELS,
    manifest,
    planCopy = DEFAULT_PLAN_COPY,
  }: PlanWorkflowOptions,
): AsyncGenerator<PlanChunk> {
  // Undefined on every ordinary turn: the service knows the catalogue.
  const catalogue = manifest;
  const brief = briefFrom(req.history ?? [], req.prompt);

  // Plan mode skips routing: the user chose it, and the router misread plan requests as chat.
  if (req.planMode === "plan") {
    const proposal = yield* routeTurn(
      req.prompt,
      req.history ?? [],
      catalogue,
      req.digest,
      req.images,
      req.summary,
      transport,
      signal,
      "plan",
      req.model,
      req.mentions,
      req.locale,
    );
    if (!proposal?.reply) {
      yield { type: "text", delta: planCopy.unavailable };
    }
    // After the prose, never instead of it: the offer is the next step, not the answer.
    if (proposal?.brief) {
      yield { type: "offer", brief: proposal.brief };
    }
    yield { type: "done" };
    return;
  }

  // Route before planning: a graph built on an incomplete brief costs a call per node, wasted.
  const decided = yield* routeTurn(
    req.prompt,
    req.history ?? [],
    catalogue,
    req.digest,
    req.images,
    req.summary,
    transport,
    signal,
    "route",
    req.model,
    req.mentions,
    req.locale,
  );
  // A chat verdict stands even with an empty reply: building is what the router ruled out.
  if (decided?.route === "chat") {
    if (!decided.reply) yield { type: "text", delta: planCopy.unavailable };
    yield { type: "done" };
    return;
  }

  // Filtered here: what was already asked is a fact about the thread, which lives host-side.
  const history = req.history ?? [];
  const asked = worthAsking(history, decided?.questions ?? [], req.answering);

  if (asked.length) {
    yield { type: "questions", questions: asked };
    yield { type: "done" };
    return;
  }

  const accepted = await transport.fetch(`${transport.baseUrl}/workflow/plan`, {
    method: "POST",
    body: JSON.stringify({
      // Router's rewrite first; else the latest turn alone, or the whole brief for an answer.
      prompt:
        decided?.request?.trim() || (req.answering ? brief : req.prompt),
      // Earlier turns as context; skipped for an answer turn, whose brief is the request.
      ...(() => {
        if (req.answering) return {};
        const context = contextFrom(req.history ?? [], req.prompt);
        return context ? { context } : {};
      })(),
      // Only on override: the service's whole catalogue keeps the gateway prefix cache warm.
      ...(catalogue ? { manifest: catalogue } : {}),
      // Existing ids, so a change can be a change: without them the planner can only add.
      ...(req.digest ? { digest: req.digest } : {}),
      // Only when routing asked to look: pictures are the costliest thing this call carries.
      ...(decided?.needsImages && req.images?.length
        ? { images: req.images }
        : {}),
      ...(req.mentions?.length ? { mentions: req.mentions } : {}),
      // For the question the service writes itself when an ask rule holds the plan back.
      ...(req.locale ? { locale: req.locale } : {}),
      // The plan stage's ask rules need it too, or they re-ask on the turn that answered.
      ...(req.answering ? { answering: true } : {}),
      ...(req.params ? { params: req.params } : {}),
      ...(req.model ? { model: req.model } : {}),
    }),
    signal,
  });

  if (!accepted.ok) {
    throw new PlanSubmitError(
      `Could not start planning (${accepted.status}).`,
      accepted.status,
    );
  }

  const { job_id: jobId } = (await accepted.json()) as { job_id?: string };
  if (!jobId) {
    throw new PlanSubmitError("Planning started but reported no job id.", 200);
  }

  const stream = await transport.fetch(
    `${transport.baseUrl}/jobs/${encodeURIComponent(jobId)}/stream`,
    { signal },
    "text/event-stream",
  );

  if (!stream.ok || !stream.body) {
    yield {
      type: "error",
      message: `Lost the connection to the planner (${stream.status}).`,
      retryable: true,
    };
    return;
  }

  const map = createPlanEventMapper(labels);
  let sawTerminal = false;

  for await (const frame of readSseFrames(stream.body, signal)) {
    const event = toJobEvent(frame.event, frame.data);
    // An unparseable frame is skipped; the next one may be the answer.
    if (!event) continue;
    for (const chunk of map(event)) {
      if (chunk.type === "done" || chunk.type === "error") sawTerminal = true;
      yield chunk;
    }
  }

  // No terminal event: the stream dropped. Say so rather than leave the composer disabled.
  if (!sawTerminal && !signal?.aborted) {
    yield {
      type: "error",
      message: "The planner stopped responding before it finished.",
      retryable: true,
    };
  }
}
