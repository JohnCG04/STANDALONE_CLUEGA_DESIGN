/**
 * The current UI language, readable outside React.
 *
 * `useTranslate` owns the switching; this module owns the value, so code with no
 * provider above it (fetch helpers, SSE drivers) can still read the language.
 * It is deliberately a plain `.ts` module with no React import: those callers
 * are reachable from `node --test`, whose resolver cannot load a `.tsx` file.
 */

import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGE_STORAGE_KEY, type LanguageCode } from "@/i18n/config";

// Mirrors the language every switch path actually applies (mount, storage event,
// cross-tab broadcast, setLang) — unlike `readStoredLanguage` this is never gated
// by cookie consent, so it is the right source of truth to read.
let currentDocumentLanguage: LanguageCode | null = null;

/**
 * WHERE the current language came from.
 *
 * Not every language on screen is a preference. `DEFAULT_LANGUAGE` is what a
 * page renders with before anything is known, and treating that as a choice is
 * how a reader's saved language got overwritten: the profile said "en", the
 * provider re-seeded from the default on a remount, and the write-back posted
 * "zh" over the profile it had just read (measured on dev, 2026-09-16 — the
 * interface flipped between English and 繁體中文 with nobody touching it).
 *
 * "user" is the only source that may be written anywhere durable.
 */
export type LanguageSource = "default" | "stored" | "profile" | "user";

let currentSource: LanguageSource = "default";

export function setCurrentLanguage(lang: LanguageCode, source: LanguageSource = "default") {
  currentDocumentLanguage = lang;
  currentSource = source;
}

export function currentLanguageSource(): LanguageSource {
  return currentSource;
}

/**
 * The language this TAB has settled on, or null if it never has.
 *
 * Unlike `currentLanguage()` this does not fall back to the default: a caller
 * re-seeding state needs to tell "nobody has decided yet" from "the default was
 * decided on", and only the first of those may be overwritten.
 */
export function resolvedLanguage(): LanguageCode | null {
  return currentSource === "default" ? null : currentDocumentLanguage;
}

export function readStoredLanguage(): LanguageCode | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    return isLanguageCode(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** The language to render in right now; localStorage only until the provider mounts. */
export function currentLanguage(): LanguageCode {
  return currentDocumentLanguage ?? readStoredLanguage() ?? DEFAULT_LANGUAGE;
}
