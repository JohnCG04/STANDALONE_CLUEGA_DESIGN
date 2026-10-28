import type { UploadRejection } from "@/lib/uploads/limits";

/** BytePlus portrait-library limits; checked here so a bad file never spends a slot. */
// BytePlus also takes TIFF and HEIC/HEIF, but the browser can't decode them to check their size.
export const CHARACTER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const CHARACTER_IMAGE_MAX_BYTES = 30 * 1024 * 1024;
const CHARACTER_IMAGE_MIN_SIDE = 300;
const CHARACTER_IMAGE_MAX_SIDE = 6000;
const CHARACTER_IMAGE_MIN_RATIO = 0.4;
const CHARACTER_IMAGE_MAX_RATIO = 2.5;

type ImageFacts = { type: string; size: number; width: number; height: number };

function reject(code: UploadRejection["code"], messageKey: string, detail: string): UploadRejection {
  return { code, messageKey, params: {}, detail };
}

/** The first rule the image breaks, or null when BytePlus should accept its shape. */
export function characterImageRejection(facts: ImageFacts): UploadRejection | null {
  const { type, size, width, height } = facts;
  if (!(CHARACTER_IMAGE_TYPES as readonly string[]).includes(type)) {
    return reject("unsupported_type", "appChat.characters.image.type", `type ${type}`);
  }
  if (size >= CHARACTER_IMAGE_MAX_BYTES) {
    return reject("too_large", "appChat.characters.image.size", `${size}B`);
  }
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  // Open ranges like the ratio below: BytePlus writes them as (300, 6000) and "< 30 MB".
  if (short <= CHARACTER_IMAGE_MIN_SIDE || long >= CHARACTER_IMAGE_MAX_SIDE) {
    return reject("bad_content", "appChat.characters.image.dimensions", `${width}x${height}`);
  }
  const ratio = width / height;
  // BytePlus states the ratio range as open, so the bounds themselves are refused.
  if (ratio <= CHARACTER_IMAGE_MIN_RATIO || ratio >= CHARACTER_IMAGE_MAX_RATIO) {
    return reject("bad_content", "appChat.characters.image.ratio", `ratio ${ratio.toFixed(2)}`);
  }
  return null;
}
