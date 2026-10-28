// SSRF guard for the media-image proxy (`/api/artifacts/media/image`).
//
// Split out of the route so it is unit-testable: the app's test glob covers
// `lib/**/*.test.ts` but deliberately excludes `resources/**`, and this guard is the one
// piece of the proxy where a mistake is a security bug rather than a broken image.
//
// Deny reasons are returned (not thrown) so the route can log AND report them — a
// canvas showing empty boxes with no explanation is exactly the failure mode this
// module's callers had before.

export type MediaProxyConfig = {
  /** Exact origins that may be proxied on the media paths (CDP, media-AI, artifacts). */
  allowedOrigins: (string | null | undefined)[];
  /** Extra media path prefixes beyond the built-in mounts (e.g. the artifact base path). */
  extraPathPrefixes?: (string | null | undefined)[];
};

export type MediaProxyTarget =
  | { ok: true; target: URL; rule: string }
  | { ok: false; reason: string };

// The CDP media mount paths artifacts are served under.
export const MEDIA_PATH_PREFIXES = ["/media/", "/api/v1/media/", "/artifact-files/"];
// Public R2 CDN — read-only, CORS-safe; no auth is ever attached for these.
const R2_CDN_PATTERN = /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i;
// First-party domains. Artifact urls arrive fully-qualified on whichever deployed CDP
// host produced them, which need not match the locally-configured one — so a suffix
// match plus a media path is the workable rule. Suffix matching is also precisely why
// this proxy never forwards credentials (see the route).
const FIRST_PARTY_SUFFIXES = [".cluega.com", ".cluega.ai"];
const FIRST_PARTY_HOSTS = ["cluega.com", "cluega.ai"];

export function safeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function pathPrefixes(config: MediaProxyConfig): string[] {
  const extra = (config.extraPathPrefixes ?? [])
    .map((value) => normalizePathPrefix(value))
    .filter((value): value is string => Boolean(value));
  return [...MEDIA_PATH_PREFIXES, ...extra];
}

/** `https://host/media/artifact-files` → `/media/artifact-files/`; a bare origin → null. */
function normalizePathPrefix(value: string | null | undefined): string | null {
  if (!value) return null;
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      pathname = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith("/")) return null;
  const trimmed = pathname.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return null;
  return `${trimmed}/`;
}

function hasMediaPath(target: URL, config: MediaProxyConfig): boolean {
  return pathPrefixes(config).some((prefix) => target.pathname.startsWith(prefix));
}

function isFirstPartyHost(host: string): boolean {
  return (
    FIRST_PARTY_HOSTS.includes(host)
    || FIRST_PARTY_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/**
 * Parse a candidate url, trying the ABSOLUTE form first and only then resolving against
 * `base`.
 *
 * Order matters, and not for style. `new URL(input, base)` parses the BASE first and
 * throws if it is unusable — before it has even looked at `input` — so one bad base
 * rejects perfectly good absolute urls. That is not hypothetical: the route derives its
 * base from `NEXT_PUBLIC_MEDIA_AI_API_URI`, a build input no deployment sets, and a
 * blank one made every request here `invalid-url` on built images while dev worked.
 * Absolute-first means the shape every caller actually sends (a fully-qualified artifact
 * or CDN url) never depends on that variable at all.
 *
 * Nothing else changes: when `base` is valid it is ignored for absolute input anyway —
 * `new URL(absolute, base)` already discards it — so only the previously-throwing cases
 * behave differently. The guard below still runs on whatever comes back.
 */
function parseTarget(input: string, base?: string): URL | null {
  try {
    return new URL(input);
  } catch {
    // Not absolute — fall through and resolve it against `base`.
  }
  if (!base) return null;
  try {
    return new URL(input, base);
  } catch {
    return null;
  }
}

/**
 * Validate a proxy target. Also used to re-validate a redirect `location`, so it must
 * stay free of side effects.
 *
 * `base` resolves relative urls (the route passes the media-AI base, matching the
 * fully-qualified-or-media-relative urls artifacts arrive as).
 */
export function resolveMediaProxyTarget(
  raw: string,
  config: MediaProxyConfig,
  base?: string,
): MediaProxyTarget {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty-url" };

  const target = parseTarget(trimmed, base);
  if (!target) return { ok: false, reason: "invalid-url" };

  const allowedOrigins = config.allowedOrigins.filter(
    (origin): origin is string => Boolean(origin),
  );

  if (target.username || target.password) {
    return { ok: false, reason: "credentials-in-url" };
  }

  if (target.protocol !== "https:") {
    // http: only for a configured origin — that is the localhost dev CDP, not the open
    // internet (and never a raw IP an attacker can name).
    if (target.protocol === "http:" && allowedOrigins.includes(target.origin)) {
      return hasMediaPath(target, config)
        ? { ok: true, target, rule: "configured-origin" }
        : { ok: false, reason: "path-not-allowed" };
    }
    return { ok: false, reason: "protocol-not-allowed" };
  }

  if (R2_CDN_PATTERN.test(target.href)) {
    return { ok: true, target, rule: "r2-cdn" };
  }

  if (allowedOrigins.includes(target.origin)) {
    return hasMediaPath(target, config)
      ? { ok: true, target, rule: "configured-origin" }
      : { ok: false, reason: "path-not-allowed" };
  }

  if (isFirstPartyHost(target.hostname)) {
    return hasMediaPath(target, config)
      ? { ok: true, target, rule: "first-party-media-path" }
      : { ok: false, reason: "path-not-allowed" };
  }

  return { ok: false, reason: "host-not-allowed" };
}

/** Parse a `MEDIA_IMAGE_PROXY_ORIGINS`-style CSV into origins. */
export function parseOriginList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => safeOrigin(entry.trim()))
    .filter((origin): origin is string => Boolean(origin));
}

const IMAGE_SIGNATURES: { type: string; matches: (bytes: Uint8Array) => boolean }[] = [
  {
    type: "image/png",
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/gif",
    matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    type: "image/webp",
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/**
 * Artifacts are stored extensionless, so upstream often answers
 * `application/octet-stream`. Browsers sniff `<img>` today, but one `nosniff` upstream
 * would turn every canvas image blank — so name the type from the magic bytes instead of
 * passing the generic one through.
 */
export function sniffImageContentType(
  bytes: Uint8Array,
  upstreamType: string | null,
): string | null {
  if (upstreamType && upstreamType !== "application/octet-stream") return upstreamType;
  if (bytes.length < 12) return upstreamType;
  return IMAGE_SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? upstreamType;
}
