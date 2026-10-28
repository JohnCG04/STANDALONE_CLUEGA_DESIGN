/**
 * Turning a provider's failure body into a sentence a person can act on.
 *
 * Every non-2xx on the media path collapses into the upstream text, and when
 * that text is long JSON the surface shows "The media service returned an
 * unexpected response." — which is true and useless. Measured on dev: a video
 * turn died with
 *
 *     Model anthropic/claude-sonnet-4.6 does not exist … Fallbacks=None
 *
 * and the user was told only that something unexpected happened, while the
 * reason sat in the job record the whole time.
 *
 * The rules here are deliberately few. Each one has to answer two questions —
 * what happened, and what the reader should do next — or it does not earn a
 * line. Anything unrecognised falls through to the generic message rather than
 * guessing.
 */

export interface ProviderFailure {
  /** What to show the user. */
  message: string;
  /** Stable id for logs and tests; never shown. */
  kind:
    | "model_unavailable"
    | "rate_limited"
    | "content_refused"
    | "reference_unreadable"
    | "source_too_long"
    | "timeout"
    | "at_capacity"
    | "upload_failed";
}

const RULES: { kind: ProviderFailure["kind"]; test: RegExp; message: string }[] = [
  {
    kind: "at_capacity",
    // FIRST, and matched on prose only as a fallback: the gateway forwards
    // media-ai's `error_code` now, and jobStatus.displayableErrorMessage reads
    // that instead. This catches the same condition arriving through a hop
    // that dropped the code — the wording a user actually reported seeing was
    // "server is at capacity (32/32 jobs running) — retry shortly", which no
    // rule matched, so it reached the chat bubble verbatim.
    test: /at capacity|jobs waiting|lane_queue_full|jobs running\) — retry/i,
    message:
      "Too much is running right now, so this one wasn’t started. Nothing was charged — send it again in a moment.",
  },
  {
    kind: "source_too_long",
    // Measured on dev 2026-09-22: a >30s clip handed to runway/aleph-2 came back
    // `Asset duration must be at most 30 seconds`, wrapped in the relay's usual
    // routing prose — which the model_unavailable rule (then first) matched,
    // telling the user the model was missing and to just try again. The retry
    // failed identically: the clip was the problem and nothing about it changed.
    // Server-side twin: media-ai-service/app/executor/provider_errors.py
    // `is_source_too_long`, which answers the same body by trimming the source.
    test: /asset duration must be at most|(?:video|source|input) duration[^.]{0,80}?(?:at most|less than or equal to|must not exceed)/i,
    message:
      "That source video is longer than this model will read. Trim it, or pick a model without an input-length limit.",
  },
  {
    kind: "rate_limited",
    test: /rate.?limit|too many requests|\b429\b/i,
    message:
      "The provider is rate-limiting us right now. Give it a minute and run it again.",
  },
  {
    kind: "content_refused",
    test: /moderation|content policy|safety system|blocked by our|privacyinformation/i,
    message:
      "The provider refused this content. Rewording the prompt — or using a different reference image — usually clears it.",
  },
  {
    kind: "reference_unreadable",
    test: /could not (?:fetch|download)|unfetchable|failed to fetch reference|invalid image url/i,
    message:
      "The reference file couldn’t be read by the provider. Re-upload it, or attach a different one.",
  },
  {
    kind: "upload_failed",
    // The render finished; SAVING it to storage did not (media-ai's executor
    // says exactly this, with the tool name and the gateway's JSON body in
    // tow). New backends send a sanitized sentence instead; this rule is the
    // defense for older deployments and for snapshots stored before the fix —
    // without it the raw text either leaked the tool name or, being long and
    // JSON-shaped, collapsed into the generic line. Kept consistent with the
    // server's own wording (media-ai `error.upload_failed`).
    test: /failed to upload to storage/i,
    message:
      "The rendered media could not be saved to storage. Please try again in a moment.",
  },
  {
    kind: "timeout",
    test: /timed out|timeout|\b504\b|deadline exceeded/i,
    message:
      "The provider took too long to answer. The job was stopped — running it again usually works.",
  },
  {
    kind: "model_unavailable",
    // LAST on purpose, and the reason the order of this list matters at all.
    // The relay wraps every provider failure in its own routing prose —
    // `No fallback model group found … Fallbacks=None` rides on a moderation
    // refusal and a dead reference exactly as it rides on a bad model id. While
    // this rule sat first, that boilerplate claimed real causes and printed
    // "the model isn't available, try again", sending the reader to retry a
    // request that could only fail the same way (measured on dev 2026-09-22
    // with an over-long source clip). Every rule above names something the body
    // itself says; this one is what is left when none of them do.
    test: /does not exist|no healthy deployment|no endpoints available|no fallback model group found/i,
    message:
      "The model that request asked for isn’t available. Try again — it will run on the default model for this kind of job.",
  },
];

/**
 * A plain-language explanation for a raw failure body, or `null` when this text
 * says nothing recognisable.
 */
export function explainProviderFailure(
  text: string | null | undefined,
): ProviderFailure | null {
  const body = (text ?? "").trim();
  if (!body) return null;
  for (const rule of RULES) {
    if (rule.test.test(body)) return { kind: rule.kind, message: rule.message };
  }
  return null;
}
