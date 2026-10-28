import { cdpFetch } from "@/lib/cdp/fetch";

import type {
  NewCharacterInput,
  UpdateCharacterInput,
  VirtualCharacter,
  VirtualCharacterImage,
  VirtualCharacterLibrary,
  VirtualCharacterStatus,
} from "./types";

type RawImage = {
  id?: string;
  status?: string;
  preview_url?: string;
  failure_reason?: string;
};

type RawCharacter = {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  cover_url?: string;
  failure_reason?: string;
  images?: RawImage[];
};

type RawLibrary = {
  items?: RawCharacter[];
  quota?: { used?: number; limit?: number; pool_available?: number };
};

const CHARACTERS = "/api/v1/virtual-characters";
const STATUSES: VirtualCharacterStatus[] = ["processing", "active", "failed", "deleting"];

function statusOf(raw: string | undefined): VirtualCharacterStatus {
  return STATUSES.find((s) => s === raw) ?? "processing";
}

function toImage(raw: RawImage): VirtualCharacterImage {
  return {
    id: raw.id ?? "",
    status: statusOf(raw.status),
    previewUrl: raw.preview_url ?? "",
    failureReason: raw.failure_reason ?? "",
  };
}

function toCharacter(raw: RawCharacter): VirtualCharacter {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
    status: statusOf(raw.status),
    coverUrl: raw.cover_url ?? "",
    failureReason: raw.failure_reason ?? "",
    images: (raw.images ?? []).map(toImage).filter((i) => i.id !== ""),
  };
}

function toCharacters(raw: RawCharacter[] | undefined): VirtualCharacter[] {
  return (raw ?? []).map(toCharacter).filter((c) => c.id !== "");
}

function count(value: unknown): number {
  return typeof value === "number" && value > 0 ? Math.floor(value) : 0;
}

/** GET: this workspace's characters (newest first) and its quota, in one call. */
export async function listVirtualCharacters(
  signal?: AbortSignal,
): Promise<VirtualCharacterLibrary> {
  const raw = await cdpFetch<RawLibrary>(CHARACTERS, { auth: { kind: "auto" }, signal });
  return {
    characters: toCharacters(raw?.items),
    quota: {
      used: count(raw?.quota?.used),
      limit: count(raw?.quota?.limit),
      poolAvailable: count(raw?.quota?.pool_available),
    },
  };
}

/** POST: one or more characters, answered 202 in `processing`; BytePlus reviews every image. */
export async function createVirtualCharacters(
  characters: NewCharacterInput[],
): Promise<VirtualCharacter[]> {
  const raw = await cdpFetch<{ items?: RawCharacter[] }>(CHARACTERS, {
    method: "POST",
    auth: { kind: "auto" },
    body: {
      characters: characters.map((c) => ({
        name: c.name,
        description: c.description,
        artifact_ids: c.artifactIds,
      })),
      // The form's checkbox; the BE refuses the create without it.
      attest_virtual: true,
    },
  });
  return toCharacters(raw?.items);
}

/** PATCH: rename, keep and add images in one call; approved images stay usable during review. */
export async function updateVirtualCharacter(
  id: string,
  input: UpdateCharacterInput,
): Promise<VirtualCharacter> {
  const raw = await cdpFetch<RawCharacter>(`${CHARACTERS}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: { kind: "auto" },
    body: {
      name: input.name,
      description: input.description,
      keep_image_ids: input.keepImageIds,
      artifact_ids: input.artifactIds,
      // Only read when the edit adds images; the form asks for the box in that case.
      attest_virtual: input.artifactIds.length > 0,
    },
  });
  return toCharacter(raw);
}

/** POST /:id/retry: sends a character's refused images to BytePlus again (uses quota again). */
export async function retryVirtualCharacter(id: string): Promise<VirtualCharacter> {
  const raw = await cdpFetch<RawCharacter>(`${CHARACTERS}/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    auth: { kind: "auto" },
  });
  return toCharacter(raw);
}

/** DELETE: gone from the library at once; its BytePlus assets go after a grace. */
export async function deleteVirtualCharacter(id: string): Promise<void> {
  await cdpFetch<unknown>(`${CHARACTERS}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: { kind: "auto" },
  });
}
