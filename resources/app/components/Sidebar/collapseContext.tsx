"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { readSidebarCollapsed, writeSidebarCollapsed } from "./sidebarCollapse";

/**
 * What a page's temporary fold asks of the rail: `hidden` is the ordinary
 * collapse (the rail gone, one key left to bring it back); `icons` keeps a
 * 64px icon rail (Big Report spec 22: 1280–1511 the rail narrows, below 1280
 * it hides).
 */
export type RailFold = "hidden" | "icons";

/**
 * Whether the left rail is folded away, shared with the page on screen.
 *
 * It used to be local state inside Sidebar, which is why collapsing left one
 * `fixed` key floating at the top-left corner of whatever was underneath: the
 * page had no way to know the rail was gone, so it could not make room. The
 * key's own comment claimed the spot was "the app header's left end, which is
 * empty" — it is the Pulse channel search, the chat's conversation title, and
 * the App Authorization breadcrumb.
 *
 * With the flag up here, a page's own header can render the key inline and push
 * its content along instead of being covered by it.
 *
 * The provider also owns the stored preference (LIB-015). It lives here rather
 * than in Sidebar because the provider is always mounted while Sidebar is not —
 * the Flow workspace swaps in a sidebar of its own — so a fold chosen there
 * would otherwise never be written.
 */
type SidebarCollapseValue = {
  /** The stored preference, before the mobile rule below. */
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => void;
  /** Whether the rail is a drawer over the page rather than a column. Passed in
   *  by the shell rather than read from MobileSidebarContext: that provider
   *  wraps only the sidebar layer, and the headers reading the fold state are
   *  in <main>, outside it. */
  isMobile: boolean;
  /** Opens the mobile drawer, when there is a shut drawer to open.
   *
   *  The drawer's own state lives in MobileSidebarContext, which wraps only the
   *  sidebar layer — the headers that draw the key are in <main>, outside it.
   *  So the shell hands the action down this context instead, the same way it
   *  already hands down `isMobile`. */
  openDrawer: (() => void) | null;
  /** How many inline expand keys are mounted right now — see
   *  `useInlineExpandKeyHost`. */
  inlineKeys: number;
  registerInlineKey: (delta: number) => void;
  /** A page's temporary fold, layered over the stored preference and never
   *  written to it — see `useTemporaryRailFold`. `null` when no page holds one. */
  railOverride: RailFold | null;
  setRailOverride: (override: RailFold | null) => void;
};

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null);

export function SidebarCollapseProvider({
  children,
  isMobile = false,
  openDrawer = null,
}: {
  children: ReactNode;
  isMobile?: boolean;
  openDrawer?: (() => void) | null;
}) {
  /*
    Read in an effect, never during render: `localStorage` does not exist on the
    server, and touching it while rendering is what makes a hydration mismatch.
    A layout effect, so the stored fold lands before the first paint rather
    than after one frame of the expanded rail.
  */
  const [railCollapsed, setRailCollapsed] = useState(false);
  const restored = useRef(false);
  useLayoutEffect(() => {
    setRailCollapsed(readSidebarCollapsed());
    restored.current = true;
  }, []);
  useEffect(() => {
    // Not before the restore has run, or the default would immediately overwrite
    // what is stored.
    if (!restored.current) return;
    writeSidebarCollapsed(railCollapsed);
  }, [railCollapsed]);

  /*
    How many headers are currently drawing the key themselves.

    This replaces a hand-written list of view names in the app shell. That list
    had to be kept in step with which pages happen to render an inline key, and
    the guard around it could only catch one direction: a page that grew a
    header without being added to the list silently kept the floating key on top
    of its own title — which is exactly the bug that kept coming back. A count
    cannot drift, because the thing being counted is the thing being asked
    about.
  */
  const [inlineKeys, setInlineKeys] = useState(0);
  const registerInlineKey = useCallback((delta: number) => {
    setInlineKeys((current) => current + delta);
  }, []);

  /*
    A page's temporary fold (the Creative Report folds the rail below 1440 while
    it is on screen). Layered OVER the preference rather than written into it,
    so leaving the page brings back exactly what the reader had — and a reload
    in the middle cannot turn the page's choice into theirs.

    The reader's own toggle wins: it drops the override and is stored as their
    preference, the same as anywhere else.
  */
  const [railOverride, setRailOverride] = useState<RailFold | null>(null);
  const chooseRailCollapsed = useCallback((collapsed: boolean) => {
    setRailOverride(null);
    setRailCollapsed(collapsed);
  }, []);

  const value = useMemo(
    () => ({
      // An icon rail is not a collapse: the rail is still there, only narrower.
      railCollapsed: railOverride === null ? railCollapsed : railOverride === "hidden",
      setRailCollapsed: chooseRailCollapsed,
      isMobile,
      openDrawer,
      inlineKeys,
      registerInlineKey,
      railOverride,
      setRailOverride,
    }),
    [
      railCollapsed,
      railOverride,
      chooseRailCollapsed,
      isMobile,
      openDrawer,
      inlineKeys,
      registerInlineKey,
    ],
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

/**
 * Reads the rail's fold state.
 *
 * `collapsed` already carries the mobile rule: below 768px the rail is a drawer
 * over the page (AppSidebarLayer), so there is no folded rail and no expand key
 * for a header to render — the drawer's own control is what opens it. Keeping
 * that rule in one place is why the headers read this rather than the raw
 * preference.
 *
 * Returns a collapsed:false stub outside the provider rather than throwing:
 * headers are reused on surfaces that have no rail at all (the landing header,
 * dialogs), and there the honest answer is "nothing is folded away" rather than
 * a crash.
 */
export function useSidebarCollapse(): {
  collapsed: boolean;
  railCollapsed: boolean;
  /** A page holds the rail at its 64px icon width (never on a phone, where the
   *  rail is a drawer). The rail draws its compact form; nothing is folded
   *  away, so no header needs a key. */
  iconRail: boolean;
  /**
   * Does THIS header need to draw an expand key?
   *
   * Not the same question as `collapsed`, which the rail itself reads to decide
   * how to draw — on a phone the rail is a drawer and is never "collapsed", so
   * every header that gated on it drew nothing and the layer's floating key had
   * to cover the header instead. This is true for a folded rail on desktop AND
   * for a shut drawer on a phone, which are the two situations where a reader
   * has no way back to the rail.
   */
  keyNeeded: boolean;
  /** What that key does: open the drawer on a phone, unfold the rail on desktop. */
  openKey: () => void;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
} {
  const context = useContext(SidebarCollapseContext);
  const isMobile = context?.isMobile ?? false;
  const railCollapsed = context?.railCollapsed ?? false;
  const set = context?.setRailCollapsed;

  const expand = useCallback(() => set?.(false), [set]);
  const collapse = useCallback(() => set?.(true), [set]);
  const toggle = useCallback(
    () => set?.(!railCollapsed),
    [set, railCollapsed],
  );

  const openDrawer = context?.openDrawer ?? null;
  const collapsed = railCollapsed && !isMobile;
  const iconRail = context?.railOverride === "icons" && !isMobile;

  return {
    collapsed,
    railCollapsed,
    iconRail,
    keyNeeded: Boolean(openDrawer) || collapsed,
    openKey: openDrawer ?? expand,
    expand,
    collapse,
    toggle,
  };
}

/**
 * Declares that this header is drawing the expand key itself, so the collapsed
 * rail does not also float one over the page.
 *
 * A LAYOUT effect, not a passive one: both keys mount in the same commit, and
 * layout effects run before the browser paints — so the floating key is dropped
 * in the same frame rather than flashing over the header for one.
 *
 * Outside the provider this is inert, which is what lets the same headers be
 * reused on surfaces that have no rail (the landing header, dialogs).
 */
export function useInlineExpandKeyHost(active: boolean): void {
  const register = useContext(SidebarCollapseContext)?.registerInlineKey;

  useLayoutEffect(() => {
    if (!active || !register) return;
    register(1);
    return () => register(-1);
  }, [active, register]);
}

/** Whether any header has claimed the key — read by the collapsed rail. */
export function useHasInlineExpandKey(): boolean {
  return (useContext(SidebarCollapseContext)?.inlineKeys ?? 0) > 0;
}

/**
 * Folds the rail while `fold` is true, without touching the stored preference,
 * and lets go when `fold` turns false or the caller unmounts.
 *
 * Built for the Creative Report (RPT_Narrow1280: below 1440 the rail folds,
 * only on that page). Once the reader toggles the rail by hand while the fold is
 * held, the hook stands down for as long as the caller stays mounted — a resize
 * must not undo a choice they just made.
 *
 * `true` is the ordinary fold (`hidden`); a `RailFold` names the form, and a
 * caller may move between the two while holding (the Big Report and Hourly:
 * icon rail 1280–1511, hidden below 1280).
 *
 * Inert outside the provider, like the hooks above.
 */
export function useTemporaryRailFold(fold: boolean | RailFold): void {
  const context = useContext(SidebarCollapseContext);
  const setOverride = context?.setRailOverride;
  const override = context?.railOverride ?? null;
  const holding = useRef<RailFold | null>(null);
  const dismissed = useRef(false);
  const mode: RailFold | null = fold === true ? "hidden" : fold === false ? null : fold;

  // The reader's toggle clears the override; seeing it cleared while we hold it
  // is how we learn they took over.
  useEffect(() => {
    if (holding.current && override === null) {
      holding.current = null;
      dismissed.current = true;
    }
  }, [override]);

  useEffect(() => {
    if (!setOverride) return;
    const want = dismissed.current ? null : mode;
    if (want && holding.current !== want) {
      holding.current = want;
      setOverride(want);
    } else if (!want && holding.current) {
      holding.current = null;
      setOverride(null);
    }
  }, [mode, setOverride]);

  useEffect(
    () => () => {
      if (holding.current) {
        holding.current = null;
        setOverride?.(null);
      }
    },
    [setOverride],
  );
}
