/** Edits pool this long before one full-sync PUT; the contract forbids a PUT per progress tick. */
export const FLUSH_DEBOUNCE_MS = 1_500;

/** Drawn terminal rows kept per page; older ones are pruned, far under the server's row cap. */
export const KEEP_APPLIED_ROWS = 40;

// A resumed job has no owning node type after a reload, so the copy names the surface.
export const RESUMED_FEATURE = "The generation";

/** How long an apply waits for the editor (and its graph api) to mount. */
export const GRAPH_API_WAIT_MS = 30_000;
export const GRAPH_API_POLL_MS = 300;
