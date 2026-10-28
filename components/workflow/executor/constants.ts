/** Saved on a node after a run, beside its result. */
export const RUN_INPUTS_KEY = "runInputs";

/** Run state and display, which change without the content changing. */
export const NOT_CONTENT = new Set([
  "status",
  "error",
  "errorDetail",
  "notice",
  "enhancing",
  "label",
  "history",
  RUN_INPUTS_KEY,
]);

/** The narrowest provider slot (image edit); exceeding it fails the node instead of queueing. */
export const DEFAULT_CONCURRENCY = 4;
