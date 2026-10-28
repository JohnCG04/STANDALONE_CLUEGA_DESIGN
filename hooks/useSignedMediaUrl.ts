"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { mediaSession, type MediaSessionState } from "@/lib/media/mediaSession";
import { isViewableMediaUrl, toViewUrl } from "@/lib/media/viewMediaUrl";

/** Where the media session stands, and a re-render whenever it changes. */
export function useMediaSessionState(): MediaSessionState {
  return useSyncExternalStore(
    mediaSession.subscribe,
    mediaSession.state,
    () => "off" as const,
  );
}

/**
 * What to draw for a stored media link given where the media session stands. Null means "not yet":
 * nothing is drawn from the stored link while the first answer about the cookie is awaited.
 */
export function displayUrlFor(
  stored: string,
  session: MediaSessionState,
  options: { nonce?: number } = {},
): string | null {
  if (!isViewableMediaUrl(stored)) return stored;
  if (session === "on") return toViewUrl(stored, options);
  return session === "off" ? stored : null;
}

/**
 * The address to load for a stored media link: the app's own view address (lib/media/viewMediaUrl.ts),
 * which a browser opens only where someone is signed in, once this browser holds the media session
 * cookie (lib/media/mediaSession.ts).
 *
 * `url` is null while the first answer about the cookie is awaited, so nothing is drawn from the stored
 * link in the meantime. A link that is not a stored media link, and any browser that cannot get the
 * cookie, gets the link as it was given.
 *
 * `refresh` is what a failed load calls. A view that answered 401 means the cookie lapsed: it asks for a
 * new one and resolves to a DIFFERENT view address, so the browser asks again; the caller compares that
 * with what failed, because the same address is never requested twice and its error would never come.
 * It resolves to null when no new cookie can be had.
 */
export function useSignedMediaUrl(stored: string | null | undefined): {
  url: string | null;
  refresh: () => Promise<string | null>;
} {
  const [nonce, setNonce] = useState(0);
  const sessionState = useMediaSessionState();
  const viewable = !!stored && isViewableMediaUrl(stored);

  useEffect(() => {
    if (viewable) void mediaSession.ensure();
  }, [viewable, stored]);

  const refresh = useCallback(async (): Promise<string | null> => {
    if (!stored) return null;
    if (!viewable) return stored;
    await mediaSession.renew();
    if (mediaSession.state() !== "on") return null;
    const next = nonce + 1;
    setNonce(next);
    return toViewUrl(stored, { nonce: next });
  }, [stored, viewable, nonce]);

  if (!stored) return { url: null, refresh };
  return { url: displayUrlFor(stored, sessionState, { nonce }), refresh };
}
