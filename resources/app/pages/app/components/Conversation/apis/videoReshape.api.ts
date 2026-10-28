// A shape request that arrived as an EDIT (media-ai `app/intent/reshape.py`).
//
// The composer calls every follow-up in a video conversation a `video_edit`
// (Conversation/index.tsx `isVideoEditFollowup` — a positional rule, it never
// reads the sentence). Asking for "分別給我 1:1 和 16:9 的版本" therefore ran a
// video-to-video edit, and the edit models all run ByteDance's input
// moderation, so the answer came back `video_edit_person_refused_all`: a wall
// about real people, in reply to a question about geometry. The 1:1 version was
// never attempted.
//
// Aspect ratio is decided when the video is DRAWN, so the fix is a new render of
// the same brief — never a v2v pass. The service refuses that turn before it
// takes a hold or fetches a file:
//
//   422 {"detail": {"code": "video_edit_reshape_requires_render",
//                   "aspect_ratios": ["1:1", "16:9"], "message": "..."}}
//
// travelling byte-for-byte through the CDP proxy (`detail` is the only
// top-level key, the same contract the intent gate relies on). Nothing is
// queued and nothing is charged, so this is a re-route, not a failure: the
// driver re-submits the turn as a generation of the previous prompt.

/** Thrown when a reshape has to be re-rendered rather than edited. */
export class VideoReshapeRequiresRenderError extends Error {
  readonly code = "video_edit_reshape_requires_render";
  /** Every ratio the sentence asked for, in delivery order. */
  readonly aspectRatios: string[];

  constructor(message: string, aspectRatios: string[]) {
    super(message);
    this.name = "VideoReshapeRequiresRenderError";
    this.aspectRatios = aspectRatios;
  }
}

// Call on a video submission Response before the generic status check. Any other
// 422 falls through to the caller's own path untouched.
export async function throwIfReshapeRequiresRender(
  response: Response,
): Promise<void> {
  if (response.status !== 422) return;

  let detail: { code?: unknown; aspect_ratios?: unknown; message?: unknown };
  try {
    // clone(): a 422 this function does not recognise must stay readable for
    // the caller's generic `response.text()`.
    const payload = (await response.clone().json()) as { detail?: unknown };
    if (!payload.detail || typeof payload.detail !== "object") return;
    detail = payload.detail as typeof detail;
  } catch {
    return;
  }

  if (detail.code !== "video_edit_reshape_requires_render") return;
  const ratios = Array.isArray(detail.aspect_ratios)
    ? detail.aspect_ratios.filter((r): r is string => typeof r === "string")
    : [];
  throw new VideoReshapeRequiresRenderError(
    typeof detail.message === "string" ? detail.message : "",
    ratios,
  );
}
