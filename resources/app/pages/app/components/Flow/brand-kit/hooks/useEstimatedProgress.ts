"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Where the estimate stops until the request answers. */
const CEILING = 95;
/** ~63% of the ceiling after this long, ~86% after twice it. */
const TIME_CONSTANT_MS = 20_000;
const TICK_MS = 200;

/**
 * A percentage for a request that reports none.
 *
 * `POST /brands/import-document` is one call with no progress events, and most
 * of its time is the model reading the file server-side — a real number does
 * not exist. This one eases toward CEILING, fast at first and slower as it
 * goes, and only `finish()` takes it to 100: a bar that waits at 95% is
 * honest, one that sits full while the request is still running is not.
 *
 * `percent` is null while idle.
 */
export function useEstimatedProgress() {
  const [percent, setPercent] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    const startedAt = Date.now();
    setPercent(0);
    timer.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setPercent(Math.round(CEILING * (1 - Math.exp(-elapsed / TIME_CONSTANT_MS))));
    }, TICK_MS);
  }, [stop]);

  const finish = useCallback(() => {
    stop();
    setPercent(100);
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setPercent(null);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { percent, start, finish, reset };
}
