/**
 * What an inline rename should do with what the user typed.
 *
 * Pulled out of the card because the decisions are the part worth testing and
 * the part that regresses: an empty name must not reach the server, a name that
 * did not change must not cost a request, and the surrounding whitespace a paste
 * brings with it is not part of the name.
 *
 * The cap matches the folder rename the PRD already specifies (§3.4, 1–50
 * characters), so the two renames in this module behave the same way.
 */
export const ASSET_NAME_MAX = 200;

export type RenameDecision =
  /** Send this to the server. */
  | { kind: "save"; name: string }
  /** Nothing to do — close the editor and keep the name that is there. */
  | { kind: "unchanged" }
  /** Refuse, and say why: the editor stays open with the text still in it. */
  | { kind: "invalid"; reason: "empty" | "too-long" };

export function decideRename(current: string, draft: string): RenameDecision {
  const name = draft.trim();
  if (name === "") return { kind: "invalid", reason: "empty" };
  if (name.length > ASSET_NAME_MAX) return { kind: "invalid", reason: "too-long" };
  if (name === current.trim()) return { kind: "unchanged" };
  return { kind: "save", name };
}
