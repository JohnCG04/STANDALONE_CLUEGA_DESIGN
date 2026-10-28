/**
 * Reconciling an authoritative markdown read with what is in the editor.
 *
 * The /account context fields (`user_md`, `cluega_md`) are raw text the user
 * owns, edited in a textarea that holds a draft. Anything that re-reads the
 * server — mounting, or a profile change elsewhere on the page — has to answer
 * one question: does the freshly read value replace what is on screen?
 *
 * It does, unless the user has typed. A dirty draft is unsaved work and the only
 * copy of it; silently replacing it would lose an edit in order to show a value
 * the user is in the middle of changing. `saved` always follows the server, so
 * the dirty check itself stays correct and Cancel still reverts to the truth.
 */
export type MarkdownFieldState = {
  /** Last value the server confirmed. */
  saved: string;
  /** What the textarea shows. Equal to `saved` when the user has not typed. */
  draft: string;
};

export function isMarkdownFieldDirty(state: MarkdownFieldState): boolean {
  return state.draft !== state.saved;
}

/**
 * Folds an authoritative read into the field state. `saved` always adopts the
 * server value; `draft` follows only while it is clean.
 */
export function mergeServerMarkdown<T extends MarkdownFieldState>(state: T, incoming: string): T {
  if (state.saved === incoming && !isMarkdownFieldDirty(state)) return state;
  if (isMarkdownFieldDirty(state)) return { ...state, saved: incoming };
  return { ...state, saved: incoming, draft: incoming };
}
