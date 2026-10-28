"use client";

import {
  forwardRef,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactEventHandler,
  type VideoHTMLAttributes,
} from "react";

import { useSignedMediaUrl } from "@/hooks/useSignedMediaUrl";
import { isViewableMediaUrl } from "@/lib/media/viewMediaUrl";
import { cn } from "@/lib/utils";

/**
 * <img> and <video> that draw a stored media link from the app's own view address while the browser holds
 * the media session cookie (lib/media/viewMediaUrl.ts says why). Drop-in: same props, same ref.
 *
 * A `src` that is not a stored media link (a blob:, a data: URL, another site's image) is used as given,
 * on the first render, so nothing about those changes. A viewable one draws a placeholder of the
 * same size until the cookie answer is known, never the stored link first.
 *
 * A failed load asks for a fresh cookie and address ONCE: a link that lapsed while the tab slept loads
 * again by itself. When the view address still does not load (a file of another company's showcase
 * that the view route does not serve, a deployment with no view routes), the element draws the stored
 * link itself, which the open media routes still answer. The error goes to the caller only when that
 * fails too, so a link that is simply not this kind of media (a clip in an <img>, a missing file)
 * still reports it.
 */
// A src whose view address exhausted every retry and still would not load — a
// file that is genuinely gone (404), not a cookie that lapsed. Remembered at
// module scope because the retry guard below is per-mount: a parent that
// remounts the element (a re-rendering list, a tile that re-keys) would
// otherwise re-run the whole dance — view address, cookie RENEW (a POST), then
// the stored link — on every mount, which is the request storm a missing
// artifact's tile produces. Once a src is known dead, a fresh mount skips
// straight to the stored link: no view request, and crucially no renew.
const deadSources = new Set<string>();
const DEAD_SOURCES_MAX = 512;

function rememberDead(src: string): void {
  if (deadSources.size >= DEAD_SOURCES_MAX) {
    // Bounded so a long-lived tab cannot grow this without limit; FIFO is fine,
    // an evicted src just pays the retry cost once more.
    const oldest = deadSources.values().next().value;
    if (oldest !== undefined) deadSources.delete(oldest);
  }
  deadSources.add(src);
}

function useSignedElement<E extends Element>(
  src: string | undefined,
  onError: ReactEventHandler<E> | undefined,
) {
  const knownDead = !!src && deadSources.has(src);
  const { url, refresh } = useSignedMediaUrl(knownDead ? null : (src ?? null));
  const retriedFor = useRef<string | null>(null);
  // A src already known dead starts in the fallback state, so no view address is
  // requested and the cookie is never renewed for it again.
  const [storedFor, setStoredFor] = useState<string | null>(knownDead ? (src ?? null) : null);
  const viewable = isViewableMediaUrl(src);
  const fellBack = viewable && storedFor === src;
  const shown = !viewable || fellBack ? src : url;

  const handleError: ReactEventHandler<E> = (event) => {
    // Not a stored link, or the stored link itself failed: nothing left to try.
    if (!viewable || !src || fellBack) {
      if (viewable && src) rememberDead(src);
      onError?.(event);
      return;
    }
    // The refreshed view address failed as well.
    if (retriedFor.current === src) {
      setStoredFor(src);
      return;
    }
    retriedFor.current = src;
    const failed = shown;
    void refresh().then((fresh) => {
      if (fresh === null || fresh === failed) setStoredFor(src);
    });
  };

  return { shown, pending: viewable && !fellBack && url === null, handleError };
}

export const SignedImg = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  function SignedImg({ src, onError, className, alt, ...rest }, ref) {
    const { shown, pending, handleError } = useSignedElement<HTMLImageElement>(
      typeof src === "string" ? src : undefined,
      onError,
    );
    if (pending) {
      return <span aria-hidden="true" className={cn("block animate-pulse bg-muted", className)} />;
    }
    // eslint-disable-next-line @next/next/no-img-element -- a view or blob URL, not an optimizable remote asset.
    return <img ref={ref} {...rest} alt={alt ?? ""} className={className} src={shown ?? src} onError={handleError} />;
  },
);

export const SignedVideo = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  function SignedVideo({ src, poster, onError, children, ...rest }, ref) {
    const { shown, pending, handleError } = useSignedElement<HTMLVideoElement>(
      typeof src === "string" ? src : undefined,
      onError,
    );
    // The still frame is a media link too. While the cookie is being asked for it is left out,
    // never drawn from the stored link.
    const signedPoster = useSignedMediaUrl(typeof poster === "string" ? poster : null);
    const posterSrc =
      typeof poster !== "string" ? undefined : isViewableMediaUrl(poster) ? (signedPoster.url ?? undefined) : poster;
    // A <video> with no src yet rather than a placeholder: callers hold a ref to the element (to play
    // it on hover, to read its duration), and an element that only appears later would miss them.
    return (
      <video ref={ref} {...rest} poster={posterSrc} src={pending ? undefined : (shown ?? src)} onError={handleError}>
        {children}
      </video>
    );
  },
);

/**
 * <a> to a stored media link, opened through its view address. While the cookie is being
 * asked for the anchor has no href (it is not a link yet), never the stored address.
 */
export const SignedLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function SignedLink({ href, children, ...rest }, ref) {
    const { url } = useSignedMediaUrl(typeof href === "string" ? href : null);
    const viewable = isViewableMediaUrl(href);
    return (
      <a
        ref={ref}
        {...rest}
        href={viewable ? (url ?? undefined) : href}
        aria-disabled={viewable && url === null ? true : rest["aria-disabled"]}
      >
        {children}
      </a>
    );
  },
);

/**
 * An element that paints a stored media link as its CSS background, from its view address.
 * `style.backgroundImage` is set here and wins over one passed in. While the cookie is being
 * asked for there is no background at all, never the stored link.
 */
export function SignedBackground({
  src,
  as: Tag = "div",
  style,
  ...rest
}: HTMLAttributes<HTMLElement> & { src: string | null | undefined; as?: "div" | "span" }) {
  const { url } = useSignedMediaUrl(src);
  const background: CSSProperties = url ? { backgroundImage: `url("${url}")` } : {};
  return <Tag {...rest} style={{ ...style, ...background }} />;
}
