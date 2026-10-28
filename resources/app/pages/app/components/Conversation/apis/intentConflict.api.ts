// The intent gate (media-ai `app/intent/gate.py`). When what the user TYPED and
// what the composer was SET TO disagree, the service refuses the submission
// instead of guessing:
//
//   409 {"detail": {"code": "intent_conflict", "conflict": "deliverable"|"count",
//                   "question": "...", "options": [...], "detected": {...},
//                   "resolution": "auto", "resolved_option_id": "proposals_first",
//                   "notice": "..."}}
//
// travelling byte-for-byte through the CDP proxy (which forwards a media-ai 4xx
// verbatim only when `detail` is its only top-level key — which is why the
// marker fields live INSIDE `detail`). Nothing is queued and no points are held
// at that point, so this is a question, not a failure.
//
// Two shapes, one body. Without `resolution: "auto"` the driver renders the
// question as a card and re-submits with the answer. WITH it, the service has
// already decided — the composer's number was a default and the sentence was
// not — so the named option is executed and the user is told what happened
// (`notice`) instead of being asked something they already said. The question
// and both options are still sent, so a client that predates the marker keeps
// rendering the card rather than an error.

/** A detected face box, as fractions (0..1) of the frame, top-left origin —
 *  the `/faces/detect` `normalizedRect` shape. */
export type IntentConflictFaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One reading of the request, as a button. */
export type IntentConflictOption = {
  id: string;
  /** `render` re-submits the job; `text_reply` asks for written options
   *  first; `attach` (the `page_unreadable` card's third option) settles
   *  the card with no job at all — the user answers by attaching a
   *  screenshot or brand material and sending again, which the service's
   *  own gate then reads as an answer on its own. */
  kind: "render" | "text_reply" | "attach";
  label: string;
  /** How many videos this reading means (render options only). */
  n?: number;
  /** How many written directions to ask for (text_reply only). */
  proposal_count?: number;
  proposal_kind?: string;
  /** The non-count axes carry their own resolved value. */
  language?: string;
  seconds?: number;
  aspect_ratio?: string;
  /** How much of the source clip an EDIT should cover: the whole thing (in as
   *  many paid windows as it takes) or just its opening window. */
  edit_scope?: "segments" | "head";
  /** Which lane the `reference_lane` question's reading means: rebuild a new
   *  video from the reference (`reference`) or edit the attached clip itself
   *  (`videoToVideo`). */
  generation_method?: string;
  /** The `clone_scope` question's answer (and the `reference_lane` card's
   *  clone option): how faithful a reference rebuild should be. Replayed
   *  verbatim as the retry's `clone_fidelity`. */
  clone_fidelity?: "style" | "structure" | "exact";
  /** The face-swap lane's answers (media-ai `app/intent/face_gate.py`): the
   *  likeness-consent attestation, and which detected face to swap. */
  face_swap_consent?: boolean;
  face_swap_target?: "prominent" | "all";
  /** One SPECIFIC detected face (the face_swap_face_N options): its box on the
   *  clip's opening frame, which the re-submission must carry verbatim. */
  face_swap_target_face?: IntentConflictFaceRect;
  /** The `page_unreadable` card's answers. The site named in the prompt could
   *  not be read (geo block, WAF, age gate), so the service refuses to guess a
   *  brand: `brand_hint` is a NAME to design around and nothing else,
   *  `page_grounding: "skip"` asks for a version with no brand on it. */
  brand_hint?: string;
  page_grounding?: "skip";
  /** The IMAGE lane's answer (media-ai `image_faces_detail`): the concrete
   *  `options.target_faces` list for the retry — one box per option, every box
   *  for "all". Echoed verbatim; the service interprets nothing on the way back. */
  target_faces?: IntentConflictFaceRect[];
  /** The completeness gate's answer (media-ai `app/intent/completeness.py`):
   *  "go ahead without it". Unlike the page gate's two answers, there is no
   *  value to carry here — the whole answer IS the confirmation — so the
   *  generic key has to ride, or the retry walks into the same gate and the
   *  card loops. The video path already sends `intentConfirmed: true` for
   *  every render option; this is the image path's channel for the same fact. */
  intent_confirmed?: true;
  /** The `multi_step_prompt` card's answer: render the whole request, or only
   *  its first step (the service cuts the prompt at the second step marker).
   *  Replayed verbatim; the client interprets nothing. */
  step_scope?: "first" | "all";
};

/** Which setting the text disagreed with. */
export type IntentConflictAxis =
  | "deliverable"
  | "count"
  | "language"
  | "duration"
  | "aspect"
  // Not a disagreement between two readings like the others: the service is
  // asking whether an edit is worth N renders before it spends them.
  | "edit_scope"
  // Also not a disagreement: rebuilding a reference and editing its actual clip
  // are two different deliverables, and the sentence asked for both or neither.
  | "reference_lane"
  // CLIENT-ONLY, and deliberately absent from the `AXES` allowlist below: the
  // theme round's confirm card is synthesized by the driver, never parsed off
  // a 409. Keeping it out of `AXES` means a server cannot claim this axis and
  // route itself into a card built for a decision this client already made.
  | "theme_confirm"
  // The exact-clone confirm: reproduce the reference verbatim (subject,
  // wording, shot timing — billed per scene at a retry ceiling) or rebuild
  // its structure with the user's own subject.
  | "clone_scope"
  // The face-swap lane's two questions: the likeness-consent attestation
  // (asked once, before anything spends), and which face when the clip's
  // opening frame shows several.
  | "face_swap_consent"
  | "face_swap_target"
  // Also not a disagreement: the link the prompt is built on could not be
  // read, and designing "a campaign cover for my website" with the website
  // unavailable is how a model ends up inventing a whole brand.
  | "page_unreadable"
  // Not a disagreement either: the request does not carry what its own words
  // promise. "parse its layout" with nothing attached, an explicit operation
  // with no file to run on, a two-step prompt with a checkpoint the lane
  // cannot stop at, or the LLM pre-flight's own follow-up questions.
  | "missing_material"
  | "missing_source"
  | "multi_step_prompt"
  | "prompt_incomplete";

export type IntentConflictDetail = {
  code: "intent_conflict";
  conflict: IntentConflictAxis;
  question: string;
  options: IntentConflictOption[];
  detected?: Record<string, unknown>;
  /** `auto` = already decided; execute `resolved_option_id`, do not ask. */
  resolution?: "auto" | "ask";
  resolved_option_id?: string;
  /** What to tell the user, written by the service in their language. */
  notice?: string;
};

/** Thrown when the service wants one confirmation before it spends anything. */
export class IntentConflictError extends Error {
  readonly code = "intent_conflict";
  readonly conflict: IntentConflictDetail["conflict"];
  readonly question: string;
  readonly options: IntentConflictOption[];
  readonly detected: Record<string, unknown>;
  /**
   * The option the service already chose, or null when this is a question.
   *
   * Resolved by looking the id up IN `options`: a marker naming something this
   * client cannot describe is treated as no marker at all, so an unknown option
   * degrades to the ask card instead of executing a guess.
   */
  readonly autoResolved: IntentConflictOption | null;
  /** The service's own sentence about what it did. Empty when it is asking. */
  readonly notice: string;

  constructor(detail: IntentConflictDetail) {
    super(detail.question);
    this.name = "IntentConflictError";
    this.conflict = detail.conflict;
    this.question = detail.question;
    this.options = detail.options;
    this.detected = detail.detected ?? {};
    this.autoResolved =
      detail.resolution === "auto" && detail.resolved_option_id
        ? detail.options.find((o) => o.id === detail.resolved_option_id) ?? null
        : null;
    this.notice = typeof detail.notice === "string" ? detail.notice : "";
  }
}

const AXES: readonly IntentConflictAxis[] = [
  "deliverable",
  "count",
  "language",
  "duration",
  "aspect",
  "edit_scope",
  "reference_lane",
  "clone_scope",
  "face_swap_consent",
  "face_swap_target",
  "page_unreadable",
  "missing_material",
  "missing_source",
  "multi_step_prompt",
  "prompt_incomplete",
];

function isOption(value: unknown): value is IntentConflictOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<IntentConflictOption>;
  return (
    typeof option.id === "string" &&
    typeof option.label === "string" &&
    (option.kind === "render" ||
      option.kind === "text_reply" ||
      option.kind === "attach")
  );
}

/**
 * Call on a video submission Response BEFORE the generic status check.
 *
 * Deliberately narrow: only a 409 whose `detail.code` is `intent_conflict` and
 * which carries at least one usable option is turned into a question. Any other
 * 409 falls through to the caller's generic path, because a question the user
 * cannot answer is worse than an error they can read.
 */
export async function throwIfIntentConflict(response: Response): Promise<void> {
  if (response.status !== 409) return;

  let detail: Partial<IntentConflictDetail>;
  try {
    // clone(): a 409 this function does not recognise must stay readable for the
    // caller's generic `response.text()`.
    const payload = (await response.clone().json()) as { detail?: unknown };
    if (!payload.detail || typeof payload.detail !== "object") return;
    detail = payload.detail as Partial<IntentConflictDetail>;
  } catch {
    return;
  }

  if (detail.code !== "intent_conflict") return;
  const options = Array.isArray(detail.options)
    ? detail.options.filter(isOption)
    : [];
  if (!options.length) return;
  const auto =
    detail.resolution === "auto" &&
    typeof detail.resolved_option_id === "string" &&
    options.some((o) => o.id === detail.resolved_option_id);
  // A question with nothing to ask is unanswerable, so it stays an error. An
  // already-decided body needs no question at all — the driver runs the option
  // and shows `notice`.
  const question =
    typeof detail.question === "string" ? detail.question.trim() : "";
  if (!question && !auto) return;

  throw new IntentConflictError({
    code: "intent_conflict",
    conflict: AXES.includes(detail.conflict as IntentConflictAxis)
      ? (detail.conflict as IntentConflictAxis)
      : "deliverable",
    question,
    options,
    detected: detail.detected ?? {},
    resolution: auto ? "auto" : "ask",
    resolved_option_id: detail.resolved_option_id,
    notice: detail.notice,
  });
}
