/**
 * Upload rules for the creative module's "+" content menu.
 *
 * The limits are enforced here rather than left to the native picker's `accept`
 * filter: a user can always defeat `accept` by switching the dialog to "All
 * files", and the spec asks for an immediate prompt when a pick is rejected.
 *
 * In lib/creative rather than beside the menu that shows them, because the menu
 * is not the main reader: `composerMedia` dispatches the validators, while
 * `attachmentRoles` and `videoMethod` derive their budgets from the numbers.
 * Living under `resources/` had all three importing backwards, into a UI folder,
 * for a module with no UI in it.
 */

/** Product images accepted per pick. From Màn hình 2. */
export const MAX_PRODUCT_IMAGES = 9;

/** The only still-image formats the generator takes. */
export const PRODUCT_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
export const PRODUCT_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/** Native picker filter for the product-image entry. */
export const PRODUCT_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

/**
 * Reference videos accepted per request.
 *
 * 1 is the PRD default and what the backend caps at until
 * `MATERIALS_MAX_REFERENCE_VIDEOS` is raised, so this ships dark and is turned up
 * by env once that lands — no code deploy, and the two numbers cannot drift into
 * "the UI let me attach three and the request 422'd".
 */
export const MAX_REFERENCE_VIDEOS: number = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_MAX_REFERENCE_VIDEOS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
})();

/**
 * Style references accepted per request (PRD IMG-03).
 *
 * One, and the number is here rather than inline so it doubles as the feature's
 * kill switch: set it to 0 and the role's budget is 0, the "+" entry disappears
 * and the payload builder has nothing to carry — no other file has to change.
 */
export const MAX_STYLE_REFERENCES = 1;

/** Audio stays a single bed: the backend never listens to it (no ASR anywhere),
 *  so it becomes one prompt line and a second has nothing to add. */
export const MAX_REFERENCE_AUDIOS = 1;

/**
 * Native picker filter for the trend/reference video entry.
 *
 * Narrowed from the old `video/*`: these three are the only video types the
 * upload service accepts (`ALLOWED_UPLOAD_MIME`). Offering `video/*` let an
 * .mkv through the picker and then 415'd it after the entire body had uploaded.
 */
export const REFERENCE_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"];
export const REFERENCE_VIDEO_EXTENSIONS = ["mp4", "mov", "webm"];
export const REFERENCE_VIDEO_ACCEPT =
  ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm";

/** Same reasoning for the audio bed. */
export const REFERENCE_AUDIO_MIME = [
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
  "audio/ogg",
];
export const REFERENCE_AUDIO_EXTENSIONS = ["mp3", "wav", "aac", "ogg", "oga"];
export const REFERENCE_AUDIO_ACCEPT =
  ".mp3,.wav,.aac,.ogg,audio/mpeg,audio/wav,audio/aac,audio/ogg";

/** Longer than this and a "reference" is really a source video. Advisory: the
 *  duration is probed client-side and an unreadable one passes. */
export const REFERENCE_VIDEO_MAX_SECONDS = 120;

const extensionOf = (fileName: string) =>
  fileName.split(".").pop()?.toLowerCase() ?? "";

export const isProductImage = (file: File): boolean =>
  PRODUCT_IMAGE_MIME.includes(file.type) ||
  PRODUCT_IMAGE_EXTENSIONS.includes(extensionOf(file.name));

export type UploadRejection = "format" | "count" | "tooLong";

export type UploadValidation = {
  /** The files that may be uploaded, already truncated to the limit. */
  accepted: File[];
  /** Why something was dropped, or null when everything passed. */
  rejection: UploadRejection | null;
};

/**
 * Filter a pick down to valid product images.
 *
 * `alreadyAttached` is counted against the limit so the ninth image is rejected
 * whether it arrives in one pick or across several.
 */
export function validateProductImages(
  files: FileList | File[],
  alreadyAttached = 0,
  /** The surface's own budget, when it publishes one (`roleCaps.product` — the
   *  Image tab allows fewer than the PRD ceiling). Defaults to the ceiling, so a
   *  caller with no budget of its own behaves exactly as before.
   *
   *  Passing it is what keeps the picker and `admitAttachments` agreeing: at 4
   *  the store admitted 4 and dropped the rest, while a picker validating against
   *  9 had already accepted and uploaded them. */
  max = MAX_PRODUCT_IMAGES,
): UploadValidation {
  return validateBatch(files, isProductImage, max, alreadyAttached);
}

/** Filter a pick down to valid files of one role, within that role's budget. */
function validateBatch(
  files: FileList | File[],
  predicate: (file: File) => boolean,
  max: number,
  alreadyAttached: number,
): UploadValidation {
  const list = Array.from(files);
  const wellFormed = list.filter(predicate);

  if (wellFormed.length === 0) {
    return { accepted: [], rejection: list.length > 0 ? "format" : null };
  }

  const room = Math.max(0, max - alreadyAttached);
  const accepted = wellFormed.slice(0, room);

  // Report the format problem first: it is the one the user can act on by
  // re-picking, whereas the count is a hard ceiling.
  if (wellFormed.length !== list.length) {
    return { accepted, rejection: "format" };
  }
  if (accepted.length < wellFormed.length) {
    return { accepted, rejection: "count" };
  }
  return { accepted, rejection: null };
}

const matches = (file: File, mimes: string[], extensions: string[]) =>
  mimes.includes(file.type) || extensions.includes(extensionOf(file.name));

export const isReferenceVideo = (file: File): boolean =>
  matches(file, REFERENCE_VIDEO_MIME, REFERENCE_VIDEO_EXTENSIONS);

export const isReferenceAudio = (file: File): boolean =>
  matches(file, REFERENCE_AUDIO_MIME, REFERENCE_AUDIO_EXTENSIONS);

/**
 * Filter a pick down to valid reference videos, within the request's budget.
 *
 * `alreadyAttached` counts now that the cap can exceed one: replace-on-pick only
 * applies while the budget IS one, so with room for three a fourth pick is a
 * count rejection rather than a silent eviction of the first.
 */
export function validateReferenceVideos(
  files: FileList | File[],
  alreadyAttached = 0,
  /** The surface's own budget, as for `validateProductImages`. Defaults to the
   *  request ceiling. */
  max = MAX_REFERENCE_VIDEOS,
): UploadValidation {
  return validateBatch(files, isReferenceVideo, max, alreadyAttached);
}

export function validateReferenceAudio(files: FileList | File[]): UploadValidation {
  return validateSingleSlot(files, isReferenceAudio);
}

function validateSingleSlot(
  files: FileList | File[],
  predicate: (file: File) => boolean,
): UploadValidation {
  const list = Array.from(files);
  const wellFormed = list.filter(predicate);
  if (wellFormed.length === 0) {
    return { accepted: [], rejection: list.length > 0 ? "format" : null };
  }
  if (wellFormed.length !== list.length) {
    return { accepted: wellFormed.slice(0, 1), rejection: "format" };
  }
  if (wellFormed.length > 1) {
    return { accepted: wellFormed.slice(0, 1), rejection: "count" };
  }
  return { accepted: wellFormed, rejection: null };
}

/**
 * Duration of a media file, in seconds, or null when it cannot be read.
 *
 * Deliberately permissive: a codec whose metadata the browser cannot parse must
 * not block a file the service would accept — the same stance `preflightUpload`
 * takes on an empty MIME type.
 */
export async function probeMediaDuration(file: File): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  const objectUrl = URL.createObjectURL(file);
  const element = document.createElement("video");
  try {
    return await new Promise<number | null>((resolve) => {
      const done = (value: number | null) => {
        element.removeAttribute("src");
        resolve(value);
      };
      element.preload = "metadata";
      element.muted = true;
      element.onloadedmetadata = () =>
        done(Number.isFinite(element.duration) ? element.duration : null);
      element.onerror = () => done(null);
      element.src = objectUrl;
      // Some browsers never fire either event for an exotic container.
      setTimeout(() => done(null), 4000);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Split a pick by whether each file is short enough to be a reference.
 *
 * Every file is probed, not just the first: with a multi-video budget, checking
 * one and uploading the rest would let a 10-minute clip through whenever it was
 * not picked first. Same permissive stance as `probeMediaDuration` — an unreadable
 * duration passes.
 */
export async function filterByDuration(
  files: File[],
  maxSeconds: number,
): Promise<{ accepted: File[]; tooLong: File[] }> {
  const durations = await Promise.all(files.map(probeMediaDuration));
  const accepted: File[] = [];
  const tooLong: File[] = [];
  files.forEach((file, index) => {
    const duration = durations[index];
    if (duration !== null && duration > maxSeconds) tooLong.push(file);
    else accepted.push(file);
  });
  return { accepted, tooLong };
}
