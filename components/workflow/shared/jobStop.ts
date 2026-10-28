// Import-free on purpose: the executor and the ledger read `isAbortError` without the media API.

/** What a stopped run rejects with. The editor reads the NAME, never the message. */
export function stoppedError(): DOMException {
  return new DOMException("Stopped", "AbortError");
}

/** A stop, however it arrived: an aborted fetch or delay, or a job media-ai reports stopped. */
export function isAbortError(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "AbortError";
}

/** Fire-and-forget: the stop already happened locally, and the next poll tells the truth. */
function fireCancel(cancel: () => Promise<unknown>): void {
  void Promise.resolve()
    .then(cancel)
    .catch((err) => console.error("[workflow] cancelling a stopped job failed", err));
}

/** Wraps only the WAIT on a job that already got its 202, cancelling it when `signal` aborts.
 *  Once aborted it only rejects with an `AbortError`, even if a result landed as the stop fired. */
export async function watchJob<T>(
  signal: AbortSignal | undefined,
  cancel: () => Promise<unknown>,
  wait: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) {
    fireCancel(cancel);
    throw stoppedError();
  }
  // The cancel is its own request: the aborted signal would kill it before it left.
  const onAbort = () => fireCancel(cancel);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const result = await wait(signal);
    if (signal?.aborted) throw stoppedError();
    return result;
  } catch (err) {
    // A fetch aborted mid-read rejects with the signal's reason — still a stop.
    throw signal?.aborted ? stoppedError() : err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
