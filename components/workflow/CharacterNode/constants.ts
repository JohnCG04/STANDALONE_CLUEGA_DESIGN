import { CHARACTER_IMAGE_TYPES } from "@/lib/virtualCharacters/characterImage";

/** `type_upload` of the source images: the user's own files, listed in their Library. */
export const CHARACTER_UPLOAD_TYPE = "user_upload";

export const CHARACTER_IMAGE_ACCEPT = CHARACTER_IMAGE_TYPES.join(",");

export const CHARACTER_NAME_MAX = 40;
export const CHARACTER_DESCRIPTION_MAX = 300;

/** Images per character; mirrors the BE's `max_images_per_character` default. */
export const CHARACTER_MAX_IMAGES = 3;

/** Characters one video can cast; mirrors the workflow lib's Video node cap. */
export const CAST_MAX = 5;

/** Shared field look: soft fill at rest, white with a faint ring on focus. */
export const FIELD_CLASS =
  "rounded-lg border-neutral-200 bg-neutral-50/70 text-[13px] shadow-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-neutral-400 hover:border-neutral-300 focus-visible:border-neutral-400 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-neutral-900/5 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:focus-visible:border-neutral-600 dark:focus-visible:bg-neutral-900 dark:focus-visible:ring-white/5";

/** The teal of the Character port and the Social palette group (`--cwf-type-character`). */
export const CAST_RING_CLASS = "ring-2 ring-teal-400 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900";
