import { THEME_COOKIE_KEY } from "@/lib/cookie-consent";
import { DEFAULT_THEME_MODE } from "@/lib/theme-preference";

/**
 * Render-blocking boot script: settles the `dark`/`light` class on `<html>`
 * BEFORE first paint, so visitors the server could not classify (no cookie, a
 * legacy `system` cookie, or a cookie that drifted from localStorage) never see
 * a flash of the wrong theme. Must stay a plain inline `<script>` — `next/script`
 * strategies run after paint, which defeats the purpose.
 *
 * Resolution order matches `useThemeStore.init`: localStorage choice first,
 * then the class the server derived from the cookie, then DEFAULT_THEME_MODE.
 *
 * The last step used to read `prefers-color-scheme`, which made the OS the
 * default rather than a choice — see DEFAULT_THEME_MODE. The OS is still
 * honoured, but only for someone who has actually picked "System": that lives
 * in the store's media listener, not here.
 */
const themeBootScript = [
  "(function(){try{",
  "var c=document.documentElement.classList;",
  `var m=localStorage.getItem(${JSON.stringify(THEME_COOKIE_KEY)});`,
  "var d;",
  'if(m==="dark"||m==="light"){d=m==="dark";}',
  'else if(m!=="system"&&(c.contains("dark")||c.contains("light"))){d=c.contains("dark");}',
  // Interpolated, not written out, so this and the store cannot drift.
  `else{d=${DEFAULT_THEME_MODE === "dark"};}`,
  'c.toggle("dark",d);c.toggle("light",!d);',
  "}catch(e){}})();",
].join("");

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />;
}
