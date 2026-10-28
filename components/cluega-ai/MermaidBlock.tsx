"use client";

/**
 * A ```mermaid fence, drawn.
 *
 * `beautiful-mermaid` rather than `mermaid` itself: it renders straight to an
 * SVG string with no browser DOM, so it is 2MB against 82MB and the same call
 * works in a node test as in the page. Measured here: 92ms for the first
 * diagram (ELK warming up) and 1-9ms for every one after it.
 *
 * Loaded lazily. A chat session that never shows a diagram never pays for the
 * library, which is the whole reason the import is inside the effect.
 *
 * THEME. The SVG carries `--bg --fg --line --accent --muted --surface --border`
 * as inline custom properties on its root, so light and dark are a CSS override
 * rather than a re-render — the same trick that keeps a resize from redrawing
 * the document pages. The values below come from the app's own tokens.
 *
 * FAILURE, measured, and it is two different things:
 *
 * * an UNSUPPORTED diagram type throws ("Invalid mermaid header: gantt"), and
 *   the fallback below shows the source — which is the right answer, since the
 *   text is still the diagram the model meant;
 * * malformed content INSIDE a supported type does not throw. The library draws
 *   what it can, so the reader sees a thin diagram rather than an error. That is
 *   also right: hiding it behind the source would hide a diagram that is merely
 *   ugly, and the model is usually close.
 *
 * Supported here: flowchart, sequence, state, class, er, xychart. Not: gantt,
 * pie, mindmap, gitgraph — and pie is no loss, the document model has a real
 * `chart` block that draws figures better than a diagram language can.
 */

import { useEffect, useRef, useState } from "react";

import { drawMermaid, legibleMinWidth } from "@/lib/documents/mermaidDrawing";

interface MermaidBlockProps {
  code: string;
  /** Replaces the wrapper's own chrome. A thumbnail brings its own frame, and
   *  the border, padding and margin below would draw a second one inside it. */
  className?: string;
  /** Draw nothing when the source will not parse, instead of falling back to
   *  showing it. A thumbnail has no room for source, and a strip of figures
   *  should not grow a box of code in the middle of it. */
  quietOnFailure?: boolean;
  /** Merged over the palette below. A caller that frames the diagram itself
   *  owns its ground, and therefore its ink: a thumbnail on a white card must
   *  not take `--fg` from a dark app theme, or the diagram is white on white. */
  style?: React.CSSProperties;
  /** Called once when the source will not parse. Lets a caller that suppressed
   *  the fallback say something of its own in its place. */
  onFailed?: () => void;
  /** Show the export/expand toolbar. Opt-in, and off by default, because the
   *  same component draws document thumbnails and the editor preview — a row of
   *  buttons over a 120px figure is chrome twice the size of the picture.
   *
   *  N05, acceptance run 2026-09-10: the diagram rendered correctly and there
   *  was no way to get it out — no SVG, no PNG, no way to copy the source — and
   *  a tall one had to be scrolled through several screens because nothing
   *  capped its height. "Sơ đồ chỉ sống trong khung chat." */
  actions?: boolean;
}

/**
 * The reading frame. `max-w-full` fits a wide diagram to the column, and the
 * `min-w` under it stops that fit at the scale its labels can still be read at
 * (`--diagram-min-width`, set per drawing below) — past it the frame scrolls
 * sideways instead. Fitted all the way down, a nine-step chain printed 5px
 * labels (N5, 05/10/2026).
 *
 * A caller passing its own `className` decides for itself: a thumbnail exists
 * to be recognised, not read, and must shrink to whatever its card is.
 */
const WRAPPER =
  "my-2 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 " +
  "[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:min-w-[var(--diagram-min-width)]";


/** The diagram's own CSS custom properties, resolved to the colours on screen.
 *
 * The rendered SVG names `var(--fg)`, `var(--line)` and the rest, and the
 * WRAPPER supplies them — which is what makes one SVG string work in both
 * themes. A file saved without them is a diagram of unresolved variables: every
 * stroke falls back to black on transparent, or to nothing at all.
 *
 * So an export reads what the browser actually computed for this element and
 * writes those values onto the SVG root. What lands on disk then looks like
 * what was on screen, in whichever theme it was on screen in.
 */
const DIAGRAM_VARS = [
  "--fg",
  "--bg",
  "--line",
  "--border",
  "--surface",
  "--muted",
  "--accent",
] as const;

function svgWithResolvedColours(host: HTMLElement): SVGSVGElement | null {
  const original = host.querySelector("svg");
  if (!original) return null;
  const copy = original.cloneNode(true) as SVGSVGElement;
  const computed = getComputedStyle(host);
  for (const name of DIAGRAM_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) copy.style.setProperty(name, value);
  }
  if (!copy.getAttribute("xmlns")) {
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  return copy;
}

/** A drawn size for an SVG that may only declare a viewBox. */
function sizeOf(svg: SVGSVGElement, host: HTMLElement): { w: number; h: number } {
  const box = svg.viewBox?.baseVal;
  if (box && box.width && box.height) return { w: box.width, h: box.height };
  const rect = host.querySelector("svg")?.getBoundingClientRect();
  return { w: Math.max(rect?.width ?? 800, 1), h: Math.max(rect?.height ?? 600, 1) };
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next frame rather than immediately: Safari cancels a
  // download whose object URL is gone before the click has been dispatched.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export function MermaidBlock({
  code,
  className,
  quietOnFailure,
  style,
  onFailed,
  actions,
}: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { renderMermaidSVGAsync } = await import("beautiful-mermaid");
        // Through `drawMermaid`, not straight to the library: the stored text
        // is the model's, and what it writes needs repairing before it reads
        // well — see that module for what and why (N5, 05/10/2026).
        //
        // Neutral ink on a transparent ground: the wrapper below paints the
        // surface, so the diagram sits on the chat bubble rather than on a
        // white card punched into it.
        const out = await drawMermaid(code, (source) =>
          renderMermaidSVGAsync(source, {
            bg: "transparent",
            fg: "#1f2328",
          }),
        );
        if (!cancelled) setSvg(out);
      } catch {
        if (cancelled) return;
        setFailed(true);
        onFailed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    if (quietOnFailure) return null;
    return (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 text-[12px] leading-relaxed text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
    );
  }

  if (svg === null) {
    // Reserves height so the message does not jump when the diagram lands.
    return (
      <div
        className={
          className
            ? `${className} animate-pulse bg-muted/40`
            : "my-2 h-24 animate-pulse rounded-lg bg-muted/40"
        }
      />
    );
  }

  const downloadSVG = () => {
    const host = hostRef.current;
    const copy = host && svgWithResolvedColours(host);
    if (!copy) return;
    save(
      new Blob([new XMLSerializer().serializeToString(copy)], {
        type: "image/svg+xml;charset=utf-8",
      }),
      "diagram.svg",
    );
  };

  const downloadPNG = () => {
    const host = hostRef.current;
    const copy = host && svgWithResolvedColours(host);
    if (!host || !copy) return;
    const { w, h } = sizeOf(copy, host);
    // 2x so the file is legible pasted into a deck, which is what a diagram
    // gets exported FOR.
    const scale = 2;
    copy.setAttribute("width", String(w));
    copy.setAttribute("height", String(h));
    const source = new XMLSerializer().serializeToString(copy);
    const image = new Image();
    image.onload = () => {
      const surface = document.createElement("canvas");
      surface.width = Math.round(w * scale);
      surface.height = Math.round(h * scale);
      const pen = surface.getContext("2d");
      if (!pen) return;
      // The diagram is drawn on transparent; a PNG pasted into a white deck
      // then loses every light stroke. The ground it was shown on is painted
      // underneath it.
      pen.fillStyle = getComputedStyle(host).backgroundColor || "#ffffff";
      pen.fillRect(0, 0, surface.width, surface.height);
      pen.drawImage(image, 0, 0, surface.width, surface.height);
      surface.toBlob((blob) => blob && save(blob, "diagram.png"), "image/png");
    };
    // A data URL rather than a blob URL: a blob-backed <img> taints the canvas
    // in Safari, and `toBlob` then throws SecurityError on the export itself.
    image.src =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
  };

  const copySource = () => {
    void navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };

  const diagram = (
    <div
      ref={hostRef}
      // The overrides are what make the diagram follow the app's theme. They sit
      // on the wrapper, not the SVG, so the SVG string stays exactly what the
      // renderer produced and is identical in both themes.
      style={
        {
          "--fg": "var(--foreground)",
          "--line": "var(--border)",
          "--border": "var(--border)",
          "--surface": "var(--muted)",
          "--muted": "var(--muted-foreground)",
          "--accent": "var(--primary)",
          // Read by WRAPPER's `min-w`, and by any caller's frame that wants the
          // same floor; ignored by one that does not mention it.
          "--diagram-min-width": `${legibleMinWidth(svg)}px`,
          ...style,
        } as React.CSSProperties
      }
      className={className ?? WRAPPER}
      // The payload is an SVG this app built from the model's text, never a
      // document from elsewhere.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  if (!actions) return diagram;

  return (
    <figure className="my-2">
      <div
        // Capped, and openable. A nine-node architecture diagram ran several
        // screens tall in the chat column and the reader had to scroll through
        // the conversation to get past it (N05, 2026-09-10). The cap is on the
        // scroller rather than on the SVG so the picture keeps its proportions.
        className={
          expanded
            ? "overflow-auto"
            : "max-h-[24rem] overflow-auto rounded-lg"
        }
      >
        {diagram}
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-1.5">
        <DiagramAction onClick={downloadSVG}>SVG</DiagramAction>
        <DiagramAction onClick={downloadPNG}>PNG</DiagramAction>
        <DiagramAction onClick={copySource}>
          {copied ? "Copied" : "Copy source"}
        </DiagramAction>
        <DiagramAction onClick={() => setExpanded((open) => !open)}>
          {expanded ? "Collapse" : "Expand"}
        </DiagramAction>
      </figcaption>
    </figure>
  );
}

/** One toolbar button. Quiet until the diagram is hovered or focused, because
 *  four controls at full contrast compete with the picture they belong to. */
function DiagramAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded border border-border px-2 py-0.5 text-[11px] font-medium " +
        "text-muted-foreground transition-colors hover:border-primary " +
        "hover:text-primary focus-visible:outline focus-visible:outline-2 " +
        "focus-visible:outline-offset-2 focus-visible:outline-primary"
      }
    >
      {children}
    </button>
  );
}
