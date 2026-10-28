/**
 * What makes running someone else's page safe.
 *
 * Pure, and its own file, because it is the security boundary — the rest of
 * `HtmlArtifact` is one iframe. A rule that matters this much should be
 * readable without reading a component, and testable without a browser.
 */

/**
 * No network of ANY kind: no fetch, no XHR, no websocket, no remote script, no
 * tracking pixel, no webfont. A page that wants a chart draws it; it cannot
 * phone anywhere for one.
 *
 * `data:` is allowed for images and fonts because that is where our own figures
 * live — the chart and diagram thumbnails are already data URIs — and a data URI
 * carries its bytes with it rather than fetching them.
 */
export const ARTIFACT_CSP =
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  "script-src 'unsafe-inline'; " +
  "img-src data: blob:; " +
  "font-src data:; " +
  "form-action 'none'; " +
  "base-uri 'none'";

/**
 * The one remote script a page may load: three.js r128, for the Game tab's 3D games.
 * The game lane (CLUEGA_AI_CDP game_tools.THREE_JS_TAG) also pins its SRI hash.
 */
export const THREE_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

/**
 * A published page (`/p/...`): ARTIFACT_CSP's closed box plus the pinned three.js, so a
 * shared 3D game runs. Nothing else opens: a published page has strangers as visitors.
 */
export const PUBLISHED_PAGE_CSP =
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  `script-src 'unsafe-inline' ${THREE_JS_URL}; ` +
  "img-src data: blob:; " +
  "font-src data:; " +
  "form-action 'none'; " +
  "base-uri 'none'";

/**
 * A page built by the Website or Game tab — the same closed box, with exactly the
 * origins a real landing page is made of opened for READING.
 *
 * Images and media from the public R2 buckets (`pub-*.r2.dev`) and the CDP media
 * mounts (`<cdp host>/media/artifact-files/…` on `*.cluega.com` / `*.cluega.ai`),
 * where generated assets are published, Google Fonts, and the pinned three.js a 3D
 * game loads. Nothing else: still no fetch, XHR or websocket (`connect-src 'none'`),
 * no other remote script, no frame, no form. Opening `connect-src` would be what
 * turns a preview into something that can phone home; loading a picture cannot.
 */
export const WEBSITE_PREVIEW_CSP =
  "default-src 'none'; " +
  "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  `script-src 'unsafe-inline' ${THREE_JS_URL}; ` +
  "img-src data: blob: https://*.r2.dev https://*.cluega.com https://*.cluega.ai; " +
  "media-src https://*.r2.dev https://*.cluega.com https://*.cluega.ai; " +
  "font-src data: https://fonts.gstatic.com; " +
  "connect-src 'none'; " +
  "frame-src 'none'; " +
  "form-action 'none'; " +
  "base-uri 'none'";

/**
 * Scripts, and nothing else.
 *
 * `allow-scripts` and `allow-same-origin` together are not two permissions, they
 * are an ESCAPE: with both, the frame shares this origin, and its script can
 * read the session cookie, read localStorage, and call our API as the signed-in
 * user. Scripts alone run in an opaque origin that owns nothing.
 */
export const ARTIFACT_SANDBOX = "allow-scripts";

/** Reports its own height, so the frame is the size of the page. A cross-origin
 *  frame cannot be measured from outside. Wrapped in try/catch: a page that
 *  throws in its own script must not take this down with it. */
const MEASURE = `<script>(function(){
  try {
    var send = function () {
      var d = document.documentElement, b = document.body;
      parent.postMessage({ __cluegaHeight: Math.max(d.scrollHeight, b ? b.scrollHeight : 0) }, "*");
    };
    if (window.ResizeObserver) new ResizeObserver(send).observe(document.documentElement);
    window.addEventListener("load", send);
    setTimeout(send, 60);
  } catch (e) {}
})();</script>`;

/** Keeps link clicks inside the page. A srcdoc frame resolves URLs against the PARENT's address,
 *  so `#pricing` would load our app in the frame. In-page anchors scroll unless the page's own
 *  script claimed the click (calls preventDefault); every other link stays put. */
const KEEP_LINKS = `<script>(function(){
  try {
    var jump = function (hash) {
      var id = hash;
      try { id = decodeURIComponent(hash); } catch (e) {}
      var el = id && (document.getElementById(id) || document.getElementsByName(id)[0]);
      if (el) el.scrollIntoView();
      else if (!id || id.toLowerCase() === "top") window.scrollTo(0, 0);
    };
    window.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href], area[href]") : null;
      var href = a ? a.getAttribute("href") : null;
      if (href === null || /^\\s*javascript:/i.test(href)) return;
      e.preventDefault();
      if (href.charAt(0) !== "#") return;
      var claimed = false, prevent = e.preventDefault;
      e.preventDefault = function () { claimed = true; prevent.call(e); };
      setTimeout(function () { if (!claimed) jump(href.slice(1)); }, 0);
    }, true);
  } catch (e) {}
})();</script>`;

/** A leading `<!doctype html>`, if the page brought one. */
const DOCTYPE = /^\s*<!doctype\s+html\s*>/i;

/**
 * The page, with the policy in front of it.
 *
 * PREPENDED, never merged into the page's own `<head>`. A CSP that arrives after
 * the first request it should have governed is a CSP that arrived too late, and
 * where the assistant put its own tags is not something we control.
 *
 * AFTER the doctype, though, when the page declares one. A DOCTYPE is only a
 * DOCTYPE while it is the first thing in the document: put anything ahead of it
 * and the browser ignores it and renders in QUIRKS MODE, where percentage
 * heights, table-cell alignment and legacy line-height all behave differently
 * from what the author wrote. The page still looks nearly right, which is what
 * makes it expensive to find.
 *
 * Sitting immediately after the doctype costs the policy nothing: it is still
 * ahead of every tag the page brought, so still ahead of every request.
 */
export function hardenArtifactHtml(html: string, csp: string = ARTIFACT_CSP): string {
  const policy =
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    MEASURE +
    KEEP_LINKS;
  const doctype = html.match(DOCTYPE);
  return doctype ? doctype[0] + policy + html.slice(doctype[0].length) : policy + html;
}
const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * A standalone page that plays `html` in a new tab, still inside the sandboxed frame.
 *
 * Opened from a blob url, which takes OUR origin, so the wrapper carries no script of
 * its own: the page runs only in the opaque-origin srcdoc frame. No CSP here either,
 * since a srcdoc frame inherits its parent's policy and would lose its inline script.
 */
export function playerPageHtml(html: string, title: string, csp: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>` +
    `<style>html,body{margin:0;height:100%;background:#000}` +
    `iframe{display:block;width:100%;height:100%;border:0}</style></head><body>` +
    `<iframe sandbox="${ARTIFACT_SANDBOX}" referrerpolicy="no-referrer" ` +
    `title="${escapeAttr(title)}" srcdoc="${escapeAttr(hardenArtifactHtml(html, csp))}">` +
    `</iframe></body></html>`
  );
}

/** The height a frame reported, or null for anything that is not one.
 *  `window` receives messages from anywhere — another artifact, an embed, a
 *  browser extension — so the value is checked as well as the sender. */
export function readReportedHeight(data: unknown): number | null {
  const reported = (data as { __cluegaHeight?: unknown } | null)?.__cluegaHeight;
  if (typeof reported !== "number" || !Number.isFinite(reported) || reported <= 0) {
    return null;
  }
  return Math.ceil(reported);
}
