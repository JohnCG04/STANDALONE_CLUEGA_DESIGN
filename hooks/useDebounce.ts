import { useCallback, useEffect, useRef } from "react";

/**
 * Debounce a callback.
 *
 * Returns a STABLE function that, when called, waits `delayMs` before invoking
 * the latest `callback`. Each new call restarts the wait, so only the final call
 * in a burst actually runs — exactly what search-as-you-type needs.
 *
 * Unlike the common "debounced value" pattern (a `useState` mirror updated by a
 * `useEffect` + `setTimeout` that reacts to the value changing), the debouncing
 * here is driven IMPERATIVELY from the event handler via a ref-held timer. So the
 * consumer keeps no debounce effect and pays no extra "value changed" render
 * pass — it just calls the returned function inside its `onChange`/`onSearch`.
 *
 * The freshest `callback` is always invoked (kept in a ref), so the returned
 * function stays referentially stable even when an inline callback is passed.
 *
 * @example
 * const runSearch = useDebounce((q: string) => fetchResults(q), 300);
 * <input onChange={(e) => runSearch(e.target.value)} />
 */
export function useDebounce<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the ref pointed at the freshest callback (synced in an effect so a ref
  // is never written during render), so the returned function can stay stable.
  useEffect(() => {
    callbackRef.current = callback;
  });

  // Cancel a still-pending call if the component unmounts mid-debounce.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (...args: Args) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
    },
    [delayMs],
  );
}
