/**
 * The conversation a generation belongs to, for the window between "the backend
 * assigned an id" and "the URL says so".
 *
 * `currentChatSessionId()` reads `/app/<id>` from the location, which is correct
 * once the app has navigated there. It is empty for the FIRST turn of a new
 * conversation: the composer submits from `/app`, the store awaits
 * `POST /api/v1/sessions`, and the generation driver creates the media job
 * before the route changes. That job then carried no `conversation_id`, so the
 * file it produced reached the library with a source badge that could not open
 * anything (PRD v1.6 3.2 asks the badge to jump back to where the content came
 * from).
 *
 * A module-level binding rather than another argument threaded through composer
 * → store → driver → job request: four signatures widened to move a value that
 * is already global to the tab.
 */
let activeChatSessionId = "";

/** Bind the conversation the next generation belongs to. */
export function setActiveChatSessionId(id: string): void {
  activeChatSessionId = (id ?? "").trim();
}

/** The bound conversation, or "" when none. */
export function getActiveChatSessionId(): string {
  return activeChatSessionId;
}

/** Forget the binding — leaving a conversation, or starting an unrelated flow. */
export function clearActiveChatSessionId(): void {
  activeChatSessionId = "";
}
