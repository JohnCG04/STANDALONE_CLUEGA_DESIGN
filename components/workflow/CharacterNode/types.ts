import type { VirtualCharacterStatus } from "@/lib/virtualCharacters/types";

/** A new upload (`artifactId`) or, while editing, an image the character already holds (`imageId`). */
export type DraftImage = {
  url: string;
  artifactId?: string;
  imageId?: string;
  status?: VirtualCharacterStatus;
};

/** One character of a form. */
export type DraftCharacter = {
  key: string;
  name: string;
  description: string;
  images: DraftImage[];
};

/** The Upload tab's unsent form. */
export type UploadDraft = {
  attested: boolean;
  characters: DraftCharacter[];
};

/** The node's `data.draft`: kept in the node so closing the drawer or a reload loses nothing. */
export type CharacterNodeState = {
  v: 2;
  /** The cast in pick order, in-review members too; `characterIds` keeps the usable ones. */
  picked: string[];
  upload: UploadDraft;
};

/** Which drawer view is open; `editId` shows that character's edit form over the tabs. */
export type DrawerView = {
  tab: "library" | "upload";
  editId?: string;
};
