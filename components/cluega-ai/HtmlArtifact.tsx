"use client";

/**
 * A page the assistant wrote, running.
 *
 * ```html in a reply used to print as a listing — the reader got the source of a
 * dashboard instead of the dashboard. This runs it, in a box that cannot reach
 * anything.
 *
 * THE SANDBOX IS THE WHOLE COMPONENT. Everything below exists to make running
 * someone else's script safe; the rendering part is one iframe.
 *
 * `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. The two together are
 * not two permissions, they are an escape: with both, the frame shares this
 * origin, and its script can read the session cookie, localStorage, and call our
 * API as the signed-in user. Scripts alone run in an opaque origin that owns
 * nothing.
 *
 * A CSP is injected on top, because the sandbox governs what the frame IS, not
 * what it can REACH. `default-src 'none'` closes every outbound door — no fetch,
 * no XHR, no websocket, no remote script, no tracking pixel, no webfont. A page
 * that wants a chart draws it; it cannot phone anywhere for one.
 *
 * The height comes back over postMessage because a cross-origin frame cannot be
 * measured from here. A page whose script never runs keeps the default.
 *
 * The policy itself lives in `lib/htmlSandbox` — pure, and tested without a
 * browser, because it is the part that must not quietly drift.
 */

import { useEffect, useRef, useState } from "react";

import {
  ARTIFACT_SANDBOX,
  hardenArtifactHtml,
  readReportedHeight,
} from "../../lib/htmlSandbox";

interface HtmlArtifactProps {
  html: string;
  labels: { preview: string; code: string };
  /** Whether the reader may switch to the markup. True in the chat, where the
   *  block IS code the reader asked to see; false in the document panel, where
   *  the page is a document and its markup is the renderer's business. */
  codeTab?: boolean;
  /** Policy injected into the page; defaults to ARTIFACT_CSP (no network at all).
   *  A web_page doc passes WEBSITE_PREVIEW_CSP so its published media can load. */
  csp?: string;
}

/** Enough to see it is a page; not so much that it takes over the conversation. */
const DEFAULT_HEIGHT = 420;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 900;

export function HtmlArtifact({ html, labels, codeTab = true, csp }: HtmlArtifactProps) {
  const [showCode, setShowCode] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only from OUR frame. The window receives messages from anywhere —
      // another artifact, an embed, an extension — and any of them could
      // otherwise resize this one.
      if (event.source !== frameRef.current?.contentWindow) return;
      const reported = readReportedHeight(event.data);
      if (reported === null) return;
      setHeight(Math.min(Math.max(reported, MIN_HEIGHT), MAX_HEIGHT));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border">
      {codeTab ? (
      <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1">
        {[
          { on: false, text: labels.preview },
          { on: true, text: labels.code },
        ].map((tab) => (
          <button
            key={tab.text}
            type="button"
            onClick={() => setShowCode(tab.on)}
            className={
              "rounded px-2 py-0.5 text-[11px] font-medium transition " +
              (showCode === tab.on
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {tab.text}
          </button>
        ))}
      </div>
      ) : null}

      {codeTab && showCode ? (
        <pre className="max-h-[420px] overflow-auto bg-muted/30 p-3 text-[11px] leading-relaxed">
          <code className="font-mono text-foreground">{html}</code>
        </pre>
      ) : (
        <iframe
          ref={frameRef}
          title={labels.preview}
          srcDoc={hardenArtifactHtml(html, csp)}
          // Scripts, and nothing else. See the note at the top of this file for
          // why `allow-same-origin` must never join it.
          sandbox={ARTIFACT_SANDBOX}
          referrerPolicy="no-referrer"
          className="w-full bg-white"
          style={{ height }}
        />
      )}
    </div>
  );
}
