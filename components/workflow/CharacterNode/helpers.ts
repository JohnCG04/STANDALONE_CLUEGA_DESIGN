import type { CharacterNodeData, CharacterNodeInput } from "@dogclaw-ad/workflow";

import { hostedFileIdFromUrl, isHostedFileId } from "@/components/workflow/shared/helpers";
import { CdpApiError } from "@/lib/cdp/errors";
import type { UploadRejection } from "@/lib/uploads/limits";
import { characterImageRejection } from "@/lib/virtualCharacters/characterImage";
import type {
  NewCharacterInput,
  UpdateCharacterInput,
  VirtualCharacter,
  VirtualCharacterQuota,
} from "@/lib/virtualCharacters/types";

import { CAST_MAX, CHARACTER_MAX_IMAGES } from "./constants";
import type { CharacterNodeState, DraftCharacter, DraftImage, UploadDraft } from "./types";

export function emptyCharacter(key: string = crypto.randomUUID()): DraftCharacter {
  return { key, name: "", description: "", images: [] };
}

function readImage(raw: unknown): DraftImage | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  return typeof i.artifactId === "string" && typeof i.url === "string"
    ? { artifactId: i.artifactId, url: i.url }
    : null;
}

function readCharacter(raw: unknown): DraftCharacter | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.key !== "string") return null;
  return {
    key: c.key,
    name: typeof c.name === "string" ? c.name : "",
    description: typeof c.description === "string" ? c.description : "",
    images: Array.isArray(c.images) ? c.images.flatMap((i) => readImage(i) ?? []) : [],
  };
}

function readUpload(raw: unknown): UploadDraft {
  const u = (raw && typeof raw === "object" ? raw : {}) as Partial<UploadDraft>;
  const characters = Array.isArray(u.characters)
    ? u.characters.flatMap((c) => readCharacter(c) ?? [])
    : [];
  return {
    attested: u.attested === true,
    // A fixed key: a random one would remount the row (and drop its upload) every render.
    characters: characters.length ? characters : [emptyCharacter("first")],
  };
}

function readIds(raw: unknown): string[] | null {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : null;
}

/** The node's state; one dropped from Assets (or saved before it had one) casts its `characterIds`. */
export function readNodeState(data: CharacterNodeData): CharacterNodeState {
  const raw = (data.draft && typeof data.draft === "object" ? data.draft : {}) as Partial<
    Record<keyof CharacterNodeState, unknown>
  >;
  return {
    v: 2,
    picked: (raw.v === 2 ? readIds(raw.picked) : null) ?? readIds(data.characterIds) ?? [],
    upload: readUpload(raw.upload),
  };
}

/** The picked characters the library still holds, in pick order. */
function castOf(picked: string[], characters: VirtualCharacter[]): VirtualCharacter[] {
  return picked.flatMap((id) => characters.find((c) => c.id === id) ?? []);
}

/** What a wired Video sends: the picks usable now; in-review ones join once approved. */
export function usableIds(picked: string[], characters: VirtualCharacter[]): string[] {
  return castOf(picked, characters)
    .filter((c) => c.status === "active")
    .map((c) => c.id);
}

/** Adds ids after the current picks, without repeats, up to what a video can cast. */
export function addPicks(picked: string[], ids: string[]): string[] {
  const next = [...picked];
  for (const id of ids) if (!next.includes(id)) next.push(id);
  return next.slice(0, CAST_MAX);
}

/** Images the workspace may still submit: its share plus what an edit frees, capped by the pool. */
export function slotsLeft(quota: VirtualCharacterQuota | undefined, freed = 0): number {
  if (!quota) return 0;
  return Math.max(0, Math.min(quota.limit - quota.used + freed, quota.poolAvailable));
}

/** Every image takes one BytePlus slot, so this is what an upload spends. */
export function uploadImageCount(upload: UploadDraft): number {
  return upload.characters.reduce((sum, c) => sum + c.images.length, 0);
}

function rowReady(row: DraftCharacter): boolean {
  return (
    row.name.trim() !== "" && row.images.length > 0 && row.images.length <= CHARACTER_MAX_IMAGES
  );
}

/** Every character named with 1–3 images, the box ticked, and the images fit the slots left. */
export function uploadReady(upload: UploadDraft, slots: number): boolean {
  return (
    upload.attested &&
    upload.characters.length > 0 &&
    uploadImageCount(upload) <= slots &&
    upload.characters.every(rowReady)
  );
}

export function toCreateInput(upload: UploadDraft): NewCharacterInput[] {
  return upload.characters.map((c) => ({
    name: c.name.trim(),
    description: c.description.trim(),
    artifactIds: c.images.flatMap((i) => i.artifactId ?? []),
  }));
}

/** Wired pictures the BE can take: ready, and stored in Cluega (it reads them by artifact id). */
export function wiredImages(inputs: CharacterNodeInput[]): DraftImage[] {
  return inputs.flatMap(({ status, media }) => {
    if (status !== "ready" || !media) return [];
    const artifactId =
      hostedFileIdFromUrl(media.url) ?? (media.id && isHostedFileId(media.id) ? media.id : null);
    return artifactId ? [{ artifactId, url: media.url }] : [];
  });
}

function isBlankRow(row: DraftCharacter): boolean {
  return !row.name.trim() && !row.description.trim() && row.images.length === 0;
}

/** The draft with `images` as a new character, on a blank row else a new one; repeats skipped. */
export function withWiredImages(upload: UploadDraft, images: DraftImage[]): UploadDraft {
  const held = new Set(upload.characters.flatMap((c) => c.images.map(imageKey)));
  const fresh = images.filter((i) => !held.has(imageKey(i))).slice(0, CHARACTER_MAX_IMAGES);
  if (!fresh.length) return upload;
  const blank = upload.characters.find(isBlankRow);
  return {
    ...upload,
    characters: blank
      ? upload.characters.map((c) => (c === blank ? { ...c, images: fresh } : c))
      : [...upload.characters, { ...emptyCharacter(), images: fresh }],
  };
}

/** Stable per image: the server id for a held image, the artifact id for a new upload. */
export function imageKey(image: DraftImage): string {
  return image.imageId ?? image.artifactId ?? image.url;
}

/** The character as an editable row; images on their way out are already gone from it. */
export function draftFromCharacter(character: VirtualCharacter): DraftCharacter {
  return {
    key: character.id,
    name: character.name,
    description: character.description,
    images: character.images
      .filter((i) => i.status !== "deleting")
      .map((i) => ({ imageId: i.id, url: i.previewUrl, status: i.status })),
  };
}

/** Only new uploads take slots; kept images already hold theirs. */
export function newImageCount(row: DraftCharacter): number {
  return row.images.filter((i) => !i.imageId).length;
}

/** Named with 1–3 images; new uploads need the box ticked and free slots. */
export function editReady(row: DraftCharacter, attested: boolean, slots: number): boolean {
  const added = newImageCount(row);
  return rowReady(row) && (added === 0 || attested) && added <= slots;
}

/** The character's wanted state for PATCH; held images left out are removed by the server. */
export function toUpdateInput(row: DraftCharacter): UpdateCharacterInput {
  return {
    name: row.name.trim(),
    description: row.description.trim(),
    keepImageIds: row.images.flatMap((i) => i.imageId ?? []),
    artifactIds: row.images.flatMap((i) => (i.imageId ? [] : (i.artifactId ?? []))),
  };
}

/** Slots an edit gives back: held images it removes (refused ones never held a slot). */
export function freedSlots(character: VirtualCharacter, row: DraftCharacter): number {
  const kept = new Set(row.images.flatMap((i) => i.imageId ?? []));
  return character.images.filter(
    (i) => (i.status === "active" || i.status === "processing") && !kept.has(i.id),
  ).length;
}

/** Reads the pixel size the BytePlus limits are stated in; null when it will not decode. */
async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** `useMediaUpload`'s validator: refuses a file BytePlus would fail before it is uploaded. */
export async function validateCharacterImage(file: File): Promise<UploadRejection | null> {
  const size = await imageSize(file);
  if (!size) {
    return {
      code: "bad_content",
      messageKey: "appChat.characters.image.type",
      params: {},
      detail: "image did not decode",
    };
  }
  return characterImageRejection({ type: file.type, size: file.size, ...size });
}

const KNOWN_ERRORS = new Set([
  "character_quota_exceeded",
  "character_pool_exhausted",
  "character_image_invalid",
  "character_rate_limited",
  "character_not_retryable",
]);

/** The server's refusal as copy: a known code gets its sentence, anything else the generic one. */
export function describeCharacterError(err: unknown, t: (key: string) => string): string {
  if (err instanceof CdpApiError && KNOWN_ERRORS.has(String(err.code))) {
    return t(`appChat.characters.errors.${err.code}`);
  }
  return t("appChat.characters.errors.generic");
}
