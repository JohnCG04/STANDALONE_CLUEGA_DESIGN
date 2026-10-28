import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import { ASSISTANT_PROSE } from "./chatType";
import { ChatCodeBlock } from "./ChatCodeBlock";
import { HtmlArtifact } from "./HtmlArtifact";
import { MermaidBlock } from "./MermaidBlock";
import remarkGfm from "remark-gfm";
import { remarkTableBreaks } from "./remarkTableBreaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// The assistant emits display/inline math with LaTeX bracket delimiters
// (\[ … \] and \( … \)), but remark-math only recognizes $…$ / $$…$$.
// Normalize the bracket forms to dollar delimiters so KaTeX renders them
// instead of leaking raw \text{}/\frac{} markup into the chat bubble.
// Skip anything inside fenced/inline code so code samples stay literal.
//
// AND EVERY OTHER `$` IS MONEY. This is a marketing product: a reply says
// "$2.51M spend, $8.32M revenue" and remark-math reads the span between the
// two signs as inline math, so KaTeX sets `M spend,` as eight italic variables
// stacked one per line. Measured on M01-015 (23/09/2026), where it ate the
// recommendation itself — "Shifting ~$258K from Indonesia into Vietnam
// (+$174K) and Philippines (+$73K) … projects $8.88M revenue" came out as a
// column of single letters. Seventh sighting in that acceptance run.
//
// The escape already existed and was wired to ONE caller
// (`escapeDashboardAnalysisCurrency`, the dashboard analysis bubble), which is
// exactly why it kept happening everywhere else. It belongs here, where every
// caller of this renderer gets it, and it runs AFTER the real math is parked
// so a genuine formula still renders. The cost is that `$x$` typed as inline
// math now reads literally; the assistant writes bracket delimiters, and
// currency outnumbers formulae in this product by orders of magnitude.
const MATH_PARK_OPEN = "\uE000";
const MATH_PARK_CLOSE = "\uE001";

function normalizeMathDelimiters(content: string): string {
  const segments = content.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return segments
    .map((seg, i) => {
      // Odd indices are the captured code spans/blocks — leave untouched.
      if (i % 2 === 1) return seg;
      const parked: string[] = [];
      const park = (rendered: string) => {
        parked.push(rendered);
        return `${MATH_PARK_OPEN}${parked.length - 1}${MATH_PARK_CLOSE}`;
      };
      const withoutMath = seg
        // Display math the model already wrote with dollars, first — so its
        // own two signs are never read as two currency signs.
        .replace(/\$\$[\s\S]+?\$\$/g, (m) => park(m))
        .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => park(`$$${body}$$`))
        .replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => park(`$${body}$`));
      // Whatever `$` is still standing is a currency sign. Already-escaped ones
      // are left alone, so a caller that escaped its own text — or a model that
      // wrote `\$` on purpose — does not end up with `\\$`.
      const escaped = withoutMath.replace(/(?<!\\)\$/g, "\\$");
      return escaped.replace(
        new RegExp(`${MATH_PARK_OPEN}(\\d+)${MATH_PARK_CLOSE}`, "g"),
        (_m, n) => parked[Number(n)],
      );
    })
    .join("");
}

// Re-indent a JSON code block so a minified single-line blob becomes readable.
// Returns null when the text isn't a JSON object/array (leave it untouched).
function prettyJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

// Self-contained markdown styling for chat bubbles. We style every element
// explicitly with Tailwind instead of relying on the `prose` typography plugin
// (which is not installed), and enable GFM (tables, strikethrough, task lists,
// autolinks) via remark-gfm — without it react-markdown renders tables as raw
// pipe text.
// Colors use semantic tokens (text-foreground, border-border, bg-muted, …) so the
// renderer adapts to light/dark automatically; only the link accent and the code
// block keep explicit colors with dark: variants.
/** Words the code block needs. Optional so a caller with no i18n still renders;
 *  the app passes translated ones. */
export interface MarkdownLabels {
  copy: string;
  copied: string;
  /** The two tabs on an ```html block. Defaulted so every existing caller keeps
   *  compiling — a label is not a reason to touch six call sites. */
  htmlPreview?: string;
  htmlCode?: string;
}

const DEFAULT_LABELS: MarkdownLabels = {
  copy: "Copy",
  copied: "Copied",
  htmlPreview: "Preview",
  htmlCode: "Code",
};

/** `children` as plain text, whatever shape react-markdown handed us. */
function textOf(children: unknown): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

/**
 * Claims a link before the browser navigates. Return true to say "I am handling
 * this href" — the click is then cancelled and the caller owns what happens next.
 *
 * SYNC on purpose: `preventDefault` only works before the handler yields, so an
 * async decision cannot be made here. Claim first, then do the async work (and
 * its own fallback) inside the handler.
 */
export type MarkdownLinkClaim = (href: string) => boolean;

/**
 * Which surface this markdown is being read on.
 *
 * `compact` is every pre-existing caller and its classes are UNCHANGED, which
 * is deliberate: this renderer has 16 call sites across 11 files and most are
 * dense UI - thought-process blocks, tool and skill cards, dashboard analysis,
 * a campaign-notes panel. Raising their body size would cost density in
 * surfaces read at a glance rather than read through.
 *
 * `chat` is the main assistant ANSWER - the one surface a reader reads end to
 * end. Measured 2026-10-02: its body was text-[13px] at text-foreground/90,
 * one pixel SMALLER and ten percent dimmer than the user bubble directly above
 * it (text-[14px], full contrast), and its headings were 15/14/13px semibold
 * against a 13px body - so an h3 was exactly body size and every heading read
 * as a bold sentence. That flattening, not a stray font-semibold, is why the
 * answer looked heavy.
 *
 * `panel` is prose read inside a card rather than as the chat turn itself (the
 * dashboard analysis): the chat scale as it stood before the 20/10/2026 Manus
 * match, so it stays in step with the 13px labels around it.
 */
export type MarkdownVariant = "chat" | "compact" | "panel";

/** Per-variant classes. Only what DIFFERS is listed, so the two variants
 *  cannot drift apart structurally. */
const V = {
  compact: {
    root: "text-[13px] leading-relaxed text-foreground/90",
    p: "my-1.5",
    a: "font-semibold",
    list: "my-1.5 space-y-0.5 pl-5",
    h1: "mb-1 mt-3 text-[15px]",
    h2: "mb-1 mt-3 text-[14px]",
    h3: "mb-1 mt-2 text-[13px]",
    code: "text-[0.85em]",
    table: "text-[12px]",
  },
  // The body is the chat's prose token (`chatType.ts`): 14px / 1.65, the
  // largest text in the turn. 15/24 with 20 / 17 / 15 headings was tried on
  // 20/10/2026 to match Manus and reverted the same day as too large; the
  // headings are back at 18 / 16 / 14.
  chat: {
    // `font-normal` is load-bearing, not decoration. The app shell renders
    // `<main class="… font-semibold">` (pages/app/index.tsx:933, added
    // deliberately in 8a13cab1b "for improved text visibility"), so every
    // descendant that does not set a weight INHERITS 600 — measured live in
    // the browser 2026-10-02: the answer paragraph and every bullet computed
    // to 15px/600 while <body> sat at 400. Nothing in the answer was bold;
    // the weight came from four levels up.
    //
    // A plain class is enough — no `!important`. Inheritance carries no
    // specificity, so any declaration on this element beats it. `strong` and
    // the headings set their own `font-semibold` on themselves and are
    // untouched, which is what keeps emphasis working.
    root: `${ASSISTANT_PROSE} font-normal text-foreground`,
    p: "my-2.5",
    // Medium, not semibold: colour and underline already mark a link, and a
    // third weight beside body and strong is what made link-dense answers read
    // as uniformly bold.
    a: "font-medium",
    list: "my-2.5 space-y-1 pl-5",
    h1: "mb-2 mt-5 text-[18px]",
    h2: "mb-1.5 mt-4 text-[16px]",
    // Body size on purpose: at the smallest heading level the step is carried
    // by weight, and the two levels above carry the size.
    h3: "mb-1 mt-3 text-[14px]",
    code: "text-[0.9em]",
    table: "text-[13px]",
  },
  panel: {
    root: "text-[14px] font-normal leading-[1.65] text-foreground",
    p: "my-2.5",
    a: "font-medium",
    list: "my-2.5 space-y-1 pl-5",
    h1: "mb-2 mt-5 text-[18px]",
    h2: "mb-1.5 mt-4 text-[16px]",
    h3: "mb-1 mt-3 text-[14px]",
    code: "text-[0.9em]",
    table: "text-[13px]",
  },
} as const;

const buildComponents = (
  labels: MarkdownLabels,
  onLinkClick?: MarkdownLinkClaim,
  variant: MarkdownVariant = "compact",
): Components => ({
  p: ({ node, ...props }) => <p className={`${V[variant].p} first:mt-0 last:mb-0`} {...props} />,
  a: ({ node, ...props }) => (
    <a
      className={`${V[variant].a} text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300`}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
      onClick={(event) => {
        const href = typeof props.href === "string" ? props.href : "";
        // Modified clicks are the user asking for a new tab/window explicitly —
        // never take those over.
        if (
          !href ||
          !onLinkClick ||
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        if (onLinkClick(href)) event.preventDefault();
      }}
    />
  ),
  ul: ({ node, ...props }) => <ul className={`${V[variant].list} list-disc`} {...props} />,
  ol: ({ node, ...props }) => <ol className={`${V[variant].list} list-decimal`} {...props} />,
  li: ({ node, ...props }) => <li className="marker:text-muted-foreground" {...props} />,
  h1: ({ node, ...props }) => <h1 className={`${V[variant].h1} font-semibold first:mt-0`} {...props} />,
  h2: ({ node, ...props }) => <h2 className={`${V[variant].h2} font-semibold first:mt-0`} {...props} />,
  h3: ({ node, ...props }) => <h3 className={`${V[variant].h3} font-semibold first:mt-0`} {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 italic text-muted-foreground" {...props} />
  ),
  hr: () => <hr className="my-3 border-border" />,
  // GFM tables — wrap so wide tables (long advertiser IDs, CJK names) scroll
  // horizontally inside the narrow chat bubble instead of overflowing.
  table: ({ node, ...props }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table
        className={`w-full border-collapse ${V[variant].table} [&_tbody_tr:nth-child(even)]:bg-muted/30`}
        {...props}
      />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-muted/70" {...props} />,
  th: ({ node, ...props }) => (
    <th
      className="whitespace-nowrap border-b border-border px-3 py-1.5 text-left font-semibold text-foreground"
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-border/60 px-3 py-1.5 align-top text-foreground/90" {...props} />
  ),
  // Code blocks use a soft, theme-consistent surface (light neutral in light
  // mode, muted in dark) instead of a harsh terminal-black box that clashes
  // with the white chat UI.
  // Pass-through. In markdown a <pre> only ever wraps a fence, and the `code`
  // handler below now returns a complete block — ChatCodeBlock brings its own
  // <pre>, MermaidBlock brings an <svg>. Keeping the wrapper here would nest a
  // <pre> inside a <pre> (invalid) and paint the surface twice.
  pre: ({ children }) => <>{children}</>,
  code: ({ node, className, children, ...props }) => {
    // Block code lives inside <pre> and inherits its surface; only set the font.
    // Inline code gets a subtle pill.
    const isBlock =
      /language-/.test(className || "") ||
      String(children).includes("\n");
    if (isBlock) {
      const raw = textOf(children);
      const language = /language-([\w-]+)/.exec(className || "")?.[1];

      // ```mermaid is a picture, not a listing. Drawn rather than printed —
      // see MermaidBlock for why the library is loaded lazily.
      if (language === "mermaid") {
        // `actions` only here. The same component draws document thumbnails and
        // the editor preview, where a row of buttons would be chrome twice the
        // size of the figure — see MermaidBlock for the prop's reasoning.
        return <MermaidBlock code={raw.replace(/\n$/, "")} actions />;
      }

      // ```html is a page, not a listing. The reader asked for a dashboard and
      // was handed its source. Run it — in a frame that can reach nothing, see
      // HtmlArtifact.
      if (language === "html") {
        return (
          <HtmlArtifact
            html={raw.replace(/\n$/, "")}
            labels={{
              preview: labels.htmlPreview ?? "Preview",
              code: labels.htmlCode ?? "Code",
            }}
          />
        );
      }

      // Pretty-print JSON blocks so a minified single-line blob renders indented
      // and readable (the assistant sometimes emits minified JSON).
      const pretty = prettyJsonText(raw);
      return (
        <ChatCodeBlock
          code={(pretty ?? raw).replace(/\n$/, "")}
          language={language}
          copyLabel={labels.copy}
          copiedLabel={labels.copied}
        />
      );
    }
    return (
      <code className={`rounded bg-muted px-1 py-0.5 font-mono ${V[variant].code} text-foreground`} {...props}>
        {children}
      </code>
    );
  },
});

// Hoisted out of the render. `ReactMarkdown` compares these arrays by identity
// to decide whether its processor can be reused, so a fresh literal per render
// rebuilds the whole remark/rehype pipeline — and this component renders on
// every frame of the streaming reveal.
// `remarkTableBreaks` comes after the others: the table cells exist once GFM has parsed.
const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkTableBreaks];
const REHYPE_PLUGINS = [rehypeKatex];

// `buildComponents` allocates ~20 closures. Keyed on the two inputs it reads,
// so the common case (one labels object, one link handler) builds them once for
// the lifetime of the tab rather than 60 times a second while an answer streams.
const componentCache = new WeakMap<
  MarkdownLabels,
  WeakMap<object, Partial<Record<MarkdownVariant, Components>>>
>();

/** Stand-in key for "no link handler", so the no-handler case caches too. */
const NO_HANDLER: object = {};

function componentsFor(
  labels: MarkdownLabels,
  onLinkClick: MarkdownLinkClaim | undefined,
  variant: MarkdownVariant,
): Components {
  let byHandler = componentCache.get(labels);
  if (!byHandler) {
    byHandler = new WeakMap();
    componentCache.set(labels, byHandler);
  }
  const key = (onLinkClick as unknown as object) ?? NO_HANDLER;
  // Keyed by variant too. Without it the first surface to render would pin its
  // own classes into the cache and every other variant would silently inherit
  // them - the chat answer rendering at compact sizes, or worse, a tool card
  // rendering at reading sizes.
  let byVariant = byHandler.get(key);
  if (!byVariant) {
    byVariant = {};
    byHandler.set(key, byVariant);
  }
  const cached = byVariant[variant];
  if (cached) return cached;
  const built = buildComponents(labels, onLinkClick, variant);
  byVariant[variant] = built;
  return built;
}

function MarkdownMessageInner({
  content,
  labels = DEFAULT_LABELS,
  onLinkClick,
  className,
  variant = "compact",
}: {
  content: string;
  labels?: MarkdownLabels;
  /** See {@link MarkdownLinkClaim} — omit and links behave exactly as before. */
  onLinkClick?: MarkdownLinkClaim;
  /** Extra classes for the ROOT, so a caller can style the rendered blocks as a
   *  set — `stream-caret` puts a caret on the last one while an answer is still
   *  being written. Appended, never replacing: the typography below is what
   *  makes markdown look like this product's markdown. */
  className?: string;
  /** Reading surface. Defaults to `compact`, which is exactly what every
   *  caller rendered before this prop existed — so adding it changed nothing
   *  anywhere, and the main answer opts IN. See {@link MarkdownVariant}. */
  variant?: MarkdownVariant;
}) {
  return (
    <div
      className={`break-words ${V[variant].root}${className ? ` ${className}` : ""}`}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={componentsFor(labels, onLinkClick, variant)}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}

/** Memoised, because the streaming bubble re-renders on every animation frame.
 *
 * Re-parsing markdown, re-running KaTeX and rebuilding the component map at
 * 60fps over a whole answer is most of what made `/app` stop answering clicks
 * after a long turn (measured on dev, 2026-09-16). The props are a string and
 * two stable references, so the default shallow compare is exactly right: the
 * bubble still repaints on every new character, and on nothing else. */
export const MarkdownMessage = React.memo(MarkdownMessageInner);
