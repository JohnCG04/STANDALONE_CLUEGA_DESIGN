import { translateStatic } from "@/hooks/useTranslate";
import { useToastStore } from "@/lib/stores/useToastStore";

import { formatDurationList } from "../../SuggestionPills/videoGenConfig";

// Per-model option validation (media-ai `app/llm/video_validate.py`). A video
// submission carrying an option the chosen model does not accept comes back as
//   400 {"detail": {"error": "...", "model": "...", "field": "seconds",
//                   "value": 10, "allowed": [4, 8, 12, 16, 20]}}
// travelling byte-for-byte through the CDP proxy. Without this, the driver's
// generic path threw `response.text()` and the chat printed that envelope at the
// user — the shape exists precisely so the client can say which lengths to pick.

/** Thrown when a video submission is rejected for an unsupported option. */
export class MediaUnsupportedVideoOptionError extends Error {
  readonly code = "unsupported_video_option";
  readonly field: string;
  readonly value: unknown;
  readonly allowed: unknown[];
  readonly model?: string;

  constructor(
    message: string,
    field: string,
    value: unknown,
    allowed: unknown[],
    model?: string,
  ) {
    super(message);
    this.name = "MediaUnsupportedVideoOptionError";
    this.field = field;
    this.value = value;
    this.allowed = allowed;
    this.model = model;
  }
}

function unsupportedOptionMessage(
  field: string,
  value: unknown,
  allowed: unknown[],
  model?: string,
): string {
  if (field === "seconds") {
    const seconds = allowed.filter(
      (d): d is number => typeof d === "number" && Number.isFinite(d),
    );
    // The list is the whole point of the message, so fall back to the raw values
    // rather than an empty sentence if the service ever sends non-numbers.
    const list = seconds.length
      ? formatDurationList(
          seconds,
          translateStatic("suggestionPills.creative.video.durationSuffix"),
        )
      : allowed.join(" · ");
    return translateStatic(
      "appChat.composer.videoOptions.unsupportedDuration",
    ).replace("{allowed}", list);
  }
  return translateStatic("appChat.composer.videoOptions.unsupportedOption")
    .replace("{model}", model ?? "")
    .replace("{field}", field)
    .replace("{value}", String(value))
    .replace("{allowed}", allowed.join(", "));
}

// Call on any video submission Response BEFORE the generic status check (and
// after the 402 gate): turns the backend's typed 400 into a human-readable
// error, which the stream drivers render as the turn's error text, plus a toast.
// Any other 400 falls through to the caller's generic path untouched.
export async function throwIfUnsupportedVideoOption(
  response: Response,
): Promise<void> {
  if (response.status !== 400) return;

  let detail: {
    field?: unknown;
    value?: unknown;
    allowed?: unknown;
    model?: unknown;
  };
  try {
    // clone(): a 400 this function does not recognise must stay readable for the
    // caller's generic `response.text()`.
    const payload = (await response.clone().json()) as { detail?: unknown };
    if (!payload.detail || typeof payload.detail !== "object") return;
    detail = payload.detail as typeof detail;
  } catch {
    // Non-JSON 400 → the caller's generic error path reports it.
    return;
  }

  const { field, value, allowed, model } = detail;
  if (typeof field !== "string" || !Array.isArray(allowed)) return;

  const message = unsupportedOptionMessage(
    field,
    value,
    allowed,
    typeof model === "string" ? model : undefined,
  );
  useToastStore.getState().push(message);
  throw new MediaUnsupportedVideoOptionError(
    message,
    field,
    value,
    allowed,
    typeof model === "string" ? model : undefined,
  );
}
