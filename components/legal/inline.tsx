import type { ReactNode } from "react";

import { Link } from "@/components/i18n/Link";

/**
 * Minimal inline markup for translated legal copy: `**bold**` and `[label](href)`.
 *
 * The policy text lives in JSON so it can be translated, which rules out raw
 * HTML (dangerous) and a full markdown parser (overkill — legal prose only ever
 * needs emphasis and links). Site-relative links go through the locale-aware
 * `Link` so `/legal/cookies` becomes `/cn/legal/cookies` on the Chinese site;
 * `mailto:` and external URLs render as plain anchors.
 *
 * Safe in both server and client components — it is a pure function of its input
 * and uses no hooks.
 */
const TOKEN_PATTERN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * The reference site's link recipe: link blue, underline present but transparent
 * until hover, slow colour transition in and a fast one out. `text-blue-600` is
 * the link colour the rest of the public site already uses.
 */
const DEFAULT_LINK_CLASS =
  "-mx-px rounded-sm px-px text-blue-600 underline decoration-transparent underline-offset-2 transition-colors duration-400 hover:text-blue-700 hover:decoration-blue-700 hover:duration-150 active:duration-50";

type InlineOptions = {
  /** Override the link styling — the cookie panels use ink-coloured links. */
  linkClassName?: string;
  /**
   * Rewrite a site-relative href before it renders. The cookie panels use this
   * to reach the landing zone, which serves `/legal` on a different host.
   */
  resolveHref?: (href: string) => string;
};

export function renderInline(text: string, options: InlineOptions = {}): ReactNode[] {
  const linkClass = options.linkClassName ?? DEFAULT_LINK_CLASS;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // `TOKEN_PATTERN` is module-level and stateful, so reset before each pass.
  TOKEN_PATTERN.lastIndex = 0;

  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [, boldText, linkLabel, href] = match;

    if (boldText) {
      nodes.push(
        <strong key={`b-${match.index}`} className="font-semibold text-[#111827]">
          {boldText}
        </strong>,
      );
    } else if (linkLabel && href) {
      nodes.push(
        <InlineLink
          key={`a-${match.index}`}
          className={linkClass}
          href={href}
          label={linkLabel}
          resolveHref={options.resolveHref}
        />,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function InlineLink({
  className,
  href,
  label,
  resolveHref,
}: {
  className: string;
  href: string;
  label: string;
  resolveHref?: (href: string) => string;
}) {
  const isSiteRelative = href.startsWith("/") && !href.startsWith("//");
  const resolved = isSiteRelative && resolveHref ? resolveHref(href) : href;
  const isInternal = resolved.startsWith("/") && !resolved.startsWith("//");

  if (isInternal) {
    return (
      <Link href={resolved} className={className}>
        {label}
      </Link>
    );
  }

  const isExternal = /^https?:\/\//.test(resolved);

  return (
    <a
      href={resolved}
      className={className}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {label}
    </a>
  );
}
