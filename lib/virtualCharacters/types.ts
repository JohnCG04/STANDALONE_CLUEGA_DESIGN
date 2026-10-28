/** BytePlus review state of a character; only `active` ones can be cast in a video. */
export type VirtualCharacterStatus = "processing" | "active" | "failed" | "deleting";

/** One reviewed image; a character's images are kept in upload order. */
export type VirtualCharacterImage = {
  id: string;
  status: VirtualCharacterStatus;
  previewUrl: string;
  failureReason: string;
};

/** One character of the workspace's library (all in the workspace's one BytePlus folder). */
export type VirtualCharacter = {
  id: string;
  name: string;
  /** Read into every prompt that casts the character, so it describes the look. */
  description: string;
  status: VirtualCharacterStatus;
  coverUrl: string;
  failureReason: string;
  images: VirtualCharacterImage[];
};

/** Images this workspace holds against its share of the BytePlus pool. */
export type VirtualCharacterQuota = {
  used: number;
  limit: number;
  /** Free slots left in the whole pool (all workspaces). */
  poolAvailable: number;
};

export type VirtualCharacterLibrary = {
  /** Newest first. */
  characters: VirtualCharacter[];
  quota: VirtualCharacterQuota;
};

export type NewCharacterInput = {
  name: string;
  description: string;
  artifactIds: string[];
};

/** A character after an edit; the server diffs it against what it holds. */
export type UpdateCharacterInput = NewCharacterInput & {
  keepImageIds: string[];
};
