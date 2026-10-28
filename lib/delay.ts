/**
 * An abortable sleep.
 *
 * There is no platform primitive for this: `setTimeout` cannot be cancelled by a
 * signal, and `scheduler.wait()` is not available across the browsers this app
 * supports. So it is hand-rolled — but once, here, rather than in each of the nine
 * pollers and stream drivers that used to carry their own copy. Two of those copies
 * never removed the abort listener, leaking one per call.
 *
 * Rejects with the same `DOMException("Aborted", "AbortError")` that `fetch` throws,
 * so a caller can treat a cancelled wait and a cancelled request identically.
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort);
  });
}
