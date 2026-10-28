import { FAMILY } from "./constants";
import type { Face } from "./types";

const requested = new Map<string, Promise<void>>();

/** One Google face for the page, once, before the editor measures live text in it. Never
 *  rejects: on a bad name or a blocked request the text uses a fallback face. */
export function loadFont({ family, weight, italic }: Face): Promise<void> {
  if (!FAMILY.test(family)) return Promise.resolve();
  const key = `${family}:${weight}:${italic}`;
  const known = requested.get(key);
  if (known) return known;

  const href =
    "https://fonts.googleapis.com/css2?family=" +
    `${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
  const loading = new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => {
      const face = `${italic ? "italic " : ""}${weight} 16px "${family}"`;
      void document.fonts.load(face).catch(() => undefined).then(() => resolve());
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  requested.set(key, loading);
  return loading;
}
