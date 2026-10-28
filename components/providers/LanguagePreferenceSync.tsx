"use client";

import { useEffect, useRef } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { isLanguageCode, type LanguageCode } from "@/i18n/config";
import { currentLanguageSource, setCurrentLanguage } from "@/i18n/language-state";

import { DAY_MS, readUserMemo, writeUserMemo } from "@/lib/onboarding/user-memo";
import { getUserOnboardingStatus } from "@/lib/user-onboarding/client";
import {
  profileLanguage,
  saveProfileLanguage,
  shouldAdoptProfileLanguage,
} from "@/lib/user-onboarding/language-preference";

// What the profile last said the language is (a LanguageCode, or null for "no usable
// answer"), per signed-in person. A browser with no language cookie of its own
// would otherwise ask `/onboarding/me` on EVERY load just to learn the same
// answer; this carries it for a day. A switch made here refreshes it at once.
const PROFILE_LANGUAGE_MEMO = "profile-language";
const PROFILE_LANGUAGE_TTL_MS = DAY_MS;

/**
 * Keeps the UI language on the PERSON, not on the browser — X-I-06.
 *
 * Two wires, both of which were missing:
 *
 *  · on load, a browser with no language of its own adopts the one stored on
 *    the profile. This is the half QA reported: a second machine opened in
 *    Chinese because `DEFAULT_LANGUAGE` is "zh" and the choice lived only in
 *    the first machine's localStorage.
 *  · a switch made here is written back to the profile, so the next machine
 *    starts from it.
 *
 * ONLY WHEN THE BROWSER HAS NO CHOICE. Overriding a local choice from the
 * profile on every load would make the switcher look broken — it would snap
 * back on the next navigation. So the profile seeds, it does not enforce.
 *
 * Renders nothing and never blocks paint: the language already on screen is
 * the cookie's or the default, and adopting swaps it once the read returns.
 */
export function LanguagePreferenceSync({
  browserHasChoice,
}: {
  /**
   * Whether THIS browser already carries a language cookie, decided on the
   * server before any client code runs.
   *
   * It has to come from there. Reading localStorage on the client is a race
   * this component loses: I18nProvider persists the language it resolved in a
   * `useLayoutEffect`, and this component sits under `ModuleAccessGate`, which
   * renders its children only once its own check resolves — so by the time
   * anything here runs, localStorage already holds the provider's answer,
   * DEFAULT_LANGUAGE included. Two earlier versions read it (in an effect, then
   * during render) and both reported `localStorage now "zh"` against a profile
   * saying "vn": they were measuring the provider, not the browser.
   *
   * The layout already computes this to decide `deferUntilClient`, so it is the
   * same fact the provider itself is keyed on.
   */
  browserHasChoice: boolean;
}) {
  const { lang, setLang } = useTranslate();
  /*
    TWO REFS, ONE FOR EACH JOB — and they must not be one ref.

    A single "the language I settled on" ref looked tidier and was wrong twice
    over. The write effect below initialises itself from whatever is on screen,
    so it set that ref on the first pass; the seed effect then read it as
    "already handled" and refused to retry after StrictMode's remount had
    cancelled its first read. The profile arrived saying "vn" and was discarded —
    twice, for two different reasons, both caught by the browser run.

     · `adopted` — has the profile been consulted? Owned by the seed alone.
     · `lastKnown` — what is believed to be persisted? Owned by the write path,
       and pre-set by the seed so adopting never posts back what it just read.
  */
  const adopted = useRef(false);
  const lastKnown = useRef<LanguageCode | null>(null);

  useEffect(() => {
    // Nothing to adopt: this machine has its own choice, or the profile has
    // already answered.
    if (browserHasChoice || adopted.current) return;

    /*
      RE-RUNS PER MOUNT ON PURPOSE. React StrictMode (on in dev) mounts,
      unmounts and remounts; a "ran once already" latch meant the cleanup
      marked the first response stale and nothing ever asked again. `adopted`
      is set when the answer ARRIVES, not when the request leaves, so the work
      is idempotent rather than one-shot.
    */
    let cancelled = false;

    const adopt = (fromProfile: LanguageCode | null) => {
      // Consulted either way: a profile with no usable language is an answer,
      // and re-asking on every remount would be a request per mount.
      adopted.current = true;
      if (!shouldAdoptProfileLanguage(null, fromProfile)) return;
      lastKnown.current = fromProfile;
      setLang(fromProfile);
      // `setLang` is the switcher's entry point, so it labels the language a
      // USER pick. This one is the profile answering a question nobody asked
      // out loud; re-labelling it keeps the write-back below from posting
      // back what it just read.
      setCurrentLanguage(fromProfile, "profile");
    };

    // The profile answered recently for this person: adopt it without asking.
    const known = readUserMemo<LanguageCode | null>(
      PROFILE_LANGUAGE_MEMO,
      PROFILE_LANGUAGE_TTL_MS,
    );
    if (known?.fresh) {
      // Re-checked: a memo from an older build may name a language this one dropped.
      adopt(isLanguageCode(known.value) ? known.value : null);
      return;
    }

    void getUserOnboardingStatus()
      .then((status) => {
        if (cancelled) return;
        const fromProfile = profileLanguage(status);
        writeUserMemo(PROFILE_LANGUAGE_MEMO, fromProfile);
        adopt(fromProfile);
      })
      // A failed read leaves the language exactly where it was. There is
      // nothing to tell the reader: they did not ask for this.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [browserHasChoice, setLang]);

  useEffect(() => {
    if (lastKnown.current === null) {
      lastKnown.current = lang;
      return;
    }
    if (lastKnown.current === lang) return;
    lastKnown.current = lang;
    // Only a pick made by a person is worth storing on that person.
    //
    // Without this gate the default was written back as a preference: the
    // language cookie is never written until functionality cookies are
    // accepted, so every server render computed `initialLang = "zh"`, a
    // remount re-seeded the provider from it, and this effect posted "zh" over
    // the "en" the profile had answered moments earlier. The interface then
    // alternated on its own, and each flip taught the profile the wrong
    // answer (measured on dev, 2026-09-16).
    if (currentLanguageSource() !== "user") return;
    void saveProfileLanguage(lang).then((outcome) => {
      // The profile now says `lang` (or already did): keep the memo in step so
      // the next load of this browser does not adopt the answer it just replaced.
      if (outcome === "saved" || outcome === "unchanged") {
        writeUserMemo(PROFILE_LANGUAGE_MEMO, lang);
      }
    });
  }, [lang]);

  return null;
}
