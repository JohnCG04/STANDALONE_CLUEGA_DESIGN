/**
 * The proxied path as the /api/v1 proxy writes it to the server log, with the
 * share credentials in it replaced (M30-05: logs must not record credentials).
 *
 * A public share code or share token IS the authorisation — whoever reads it in
 * a log can open the report, dashboard or conversation. CDP already redacts the
 * same segments in its own access log (middleware/observability.go redactPath:
 * /shares/:token and /public/reports/:code); this proxy logged them in full.
 */
const REDACTED = "REDACTED";

export function proxyLogPath(segments: readonly string[]): string {
  return segments
    .map((segment, i) => {
      const previous = segments[i - 1];
      if (previous === "shares") return REDACTED;
      if (previous === "reports" && segments[i - 2] === "public") return REDACTED;
      return segment;
    })
    .join("/");
}

/** The same rule over a full pathname ("/api/v1/public/reports/abc"). */
export function proxyLogPathname(pathname: string): string {
  const segments = pathname.split("/");
  return proxyLogPath(segments);
}
