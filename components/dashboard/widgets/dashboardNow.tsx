"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { formatRelative, relativeMinutes } from "./widgetFormat";

/**
 * The ONE clock a dashboard's relative timestamps read.
 *
 * THE BUG (B-R-01). `WidgetShell` computed its "Updated …" caption from
 * `Date.now()` during render. React had no reason to render again — no prop
 * changed, no state changed, no data arrived — so the caption froze at whatever
 * it said when the board first painted. A board left open for an hour still
 * read "just now", which is worse than showing nothing: it is a freshness claim
 * that is actively wrong.
 *
 * WHY A CONTEXT AND NOT A HOOK PER WIDGET. A `setInterval` inside `WidgetShell`
 * would be correct and would also mean twelve timers on a twelve-widget board,
 * twelve independent wake-ups, and twelve tick boundaries — so two cards
 * showing the same `synced_at` could legitimately disagree for up to a minute,
 * one reading "2 min ago" beside the other's "3 min ago". One provider at the
 * panel means one timer and ONE `now`, so every caption on a board is computed
 * from the same instant and they move together.
 *
 * WHAT IT IS NOT. It never fetches, never refetches and never touches
 * `synced_at`: the timestamp is the server's fact and stays exactly as sent.
 * All this changes is how long ago that fact is described as being. A board
 * whose numbers are an hour old goes on saying so more accurately; it does not
 * go looking for newer ones.
 *
 * 【中文】整個看板共用一個 now：一個計時器、一個時間基準，所有卡片的相對時間一致。
 */

/**
 * `null` means NO PROVIDER, which is deliberately distinct from "a provider
 * that has not ticked yet".
 *
 * `WidgetShell` renders in places that are not a dashboard panel — the usage
 * analytics cards, a widget rendered directly by a test — and those must keep
 * behaving exactly as they did. Reading `null` is what lets the hook fall back
 * to the render-time clock rather than to a frozen zero.
 */
const DashboardNowContext = createContext<number | null>(null);

/** How often the shared clock advances. */
export const DASHBOARD_NOW_TICK_MS = 30_000;

/**
 * The instant every relative timestamp under this provider is measured against.
 *
 * Inside a provider this is the shared, advancing value. Outside one it is the
 * mount instant, read ONCE in a lazy initializer rather than on every render.
 *
 * That read has to be in an initializer, not in the render body: `Date.now()`
 * during render is the impure call this whole fix exists to remove, and the
 * linter is right to say so. It also would not buy anything — a widget with no
 * provider has nothing re-rendering it, which is precisely why the caption was
 * frozen in the first place, so re-reading the clock each render produced the
 * same string as reading it once.
 *
 * A widget outside a dashboard panel therefore renders exactly what it rendered
 * before this change. If one ever needs a live caption, the fix is to give it a
 * provider, not to make this hook guess.
 */
function useDashboardNow(): number {
  const shared = useContext(DashboardNowContext);
  const [mountedAt] = useState(() => Date.now());
  return shared ?? mountedAt;
}

/**
 * One timer for the whole board.
 *
 * THIRTY SECONDS, not sixty. The captions are whole minutes, so a 60s tick
 * would be right on average and up to 59 seconds late at every boundary — a
 * card can sit on "2 min ago" while the clock has been at three for most of a
 * minute. Half the smallest displayed unit bounds that lag at 30s, which is
 * below what a reader glancing at a caption can notice, and it is still two
 * wake-ups a minute for the entire board rather than per widget.
 *
 * `now` is state, so a tick is one re-render of this provider's subtree. That
 * is also why the value is a NUMBER rather than an object: a fresh object every
 * tick would re-render every consumer even when the minute has not changed.
 * (React.memo on `WidgetRenderer` does not block this and must not — a context
 * read is not a prop, so a memoized widget still re-renders when the clock
 * moves, which is exactly what B-R-01 needs.)
 *
 * `initialNow` exists for tests: a fake clock can pin the first value without
 * patching the global `Date`.
 */
export function DashboardNowProvider({
  children,
  initialNow,
  tickMs = DASHBOARD_NOW_TICK_MS,
}: {
  children: ReactNode;
  initialNow?: number;
  tickMs?: number;
}) {
  const [now, setNow] = useState(() => initialNow ?? Date.now());

  useEffect(() => {
    // A non-positive interval would be a busy loop, and `setInterval(fn, 0)` in
    // particular is a render storm rather than a fast clock. Refuse it and keep
    // the mounted value, which is still better than the frozen one this fixes.
    if (!Number.isFinite(tickMs) || tickMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    // Cleared on unmount AND whenever the interval changes, so closing a board
    // leaves no timer behind and no setState on an unmounted tree.
    return () => clearInterval(id);
  }, [tickMs]);

  return <DashboardNowContext.Provider value={now}>{children}</DashboardNowContext.Provider>;
}

/**
 * The freshness caption for one ISO timestamp, in the reader's language.
 *
 * ONE place, because there are three callers and they must agree to the word:
 * `WidgetShell`'s footnote, `MediaCard`'s own caption (it does not use the
 * shell) and `BoardFreshness` at the foot of the board. Written out three times
 * they would drift — a rounding rule changed in one, a locale key renamed in
 * another — and the reader would see the same instant described two ways on one
 * screen.
 *
 * `null` means SAY NOTHING: no timestamp, an empty one, or a string that is not
 * a date. Printing "Invalid Date" or "Updated NaN" is worse than silence,
 * because both read as a measurement.
 *
 * Both forms come back because both are used: `relative` is the bare reading
 * ("3 min ago"), which is what fits beside a platform name in a narrow card,
 * and `updated` is the full sentence ("Updated 3 min ago").
 */
export function useFreshnessLabel(
  syncedAt: string | null | undefined,
): { relative: string; updated: string } | null {
  const { t } = useTranslate();
  const now = useDashboardNow();
  const mins = syncedAt ? relativeMinutes(syncedAt, now) : null;
  if (mins === null) return null;
  const relative = formatRelative(mins, t, "long");
  return { relative, updated: t("dashboard.common.updated").replace("{time}", relative) };
}
