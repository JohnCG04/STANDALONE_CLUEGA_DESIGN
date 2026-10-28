export type RechargeWait = { outcome: "credited" | "timeout" | "cancelled"; balance: number | null };

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads the balance until it rises above `above`, up to `budgetMs`; a failed read waits on. */
export async function waitForBalanceAbove({
  read,
  above,
  budgetMs = 30_000,
  intervalMs = 1_500,
  now = Date.now,
  sleep = sleepFor,
  isCancelled = () => false,
}: {
  read: () => Promise<number | null>;
  above: number;
  budgetMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
}): Promise<RechargeWait> {
  const startedAt = now();
  let last: number | null = null;
  for (;;) {
    if (isCancelled()) return { outcome: "cancelled", balance: last };
    try {
      const balance = await read();
      if (balance != null) {
        last = balance;
        if (balance > above) return { outcome: "credited", balance };
      }
    } catch {
      // A failed read says nothing about the payment; the next one may answer.
    }
    if (now() - startedAt >= budgetMs) return { outcome: "timeout", balance: last };
    await sleep(intervalMs);
  }
}
