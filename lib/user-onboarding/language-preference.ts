/**
 * The UI language, carried by the USER rather than by the browser — X-I-06.
 *
 * WHAT WAS WRONG. `LANGUAGE_STORAGE_KEY` is localStorage plus a cookie, both
 * per-browser, and `DEFAULT_LANGUAGE` is "zh". So somebody who chose Vietnamese
 * on their laptop opened Cluega on a second machine and got Chinese, with
 * nothing to say why. QA filed it as a bug; it was a design that had never been
 * decided, and the decision is now: the language follows the person.
 *
 * WHY NO NEW BACKEND ROUTE. `preferred_language` is ALREADY on the stored
 * profile — the personalization wizard asks for it and `GET
 * /api/v1/onboarding/me` returns it. Nothing was missing except the two wires:
 * nobody read it on load, and the language switcher never wrote it. So this is
 * frontend-only and no existing caller changes.
 *
 * WHY THE WRITE ECHOES THE WHOLE PROFILE. There is no single-field route for
 * language (only `assistant_avatar` has one), so the write goes through the
 * wizard's own PUT. The backend preserves the fields that form does not ask
 * about — tour completion, memory_md, the avatar preference, and user_md once
 * the user owns it — but it does NOT preserve `honorific`, which the form always
 * resubmits. Echoing every value from the last GET therefore makes this write a
 * no-op in every field except the language.
 *
 * WHY IT REFUSES TO WRITE BEFORE ONBOARDING. That PUT also stamps
 * `PersonalizedAt`, which is what releases the personalization gate. A language
 * switch must not be able to skip somebody's onboarding, so an unpersonalized
 * profile is left alone and the choice simply stays in this browser.
 */

import { isLanguageCode, type LanguageCode } from "@/i18n/config";

import {
  getUserOnboardingStatus,
  submitUserPersonalization,
  type UserOnboardingProfile,
  type UserOnboardingStatus,
} from "@/lib/user-onboarding/client";

/**
 * The language stored on the profile, or null.
 *
 * Null covers three different things a caller treats alike: no profile yet, the
 * field never answered, and a value this build does not know (a locale that was
 * removed, or a stray string). Falling back to the browser's own resolution is
 * right for all three.
 */
export function profileLanguage(
  status: UserOnboardingStatus | null | undefined,
): LanguageCode | null {
  const stored = status?.profile?.preferred_language;

  return isLanguageCode(stored) ? stored : null;
}

/**
 * Whether the profile's language should be applied to this browser.
 *
 * Only when the browser has NO choice of its own. A reader who switched
 * language on this machine meant it for this machine too, and overriding that
 * from the profile on every load would make the switcher look broken — it would
 * snap back on the next navigation.
 */
export function shouldAdoptProfileLanguage(
  browserChoice: LanguageCode | null,
  fromProfile: LanguageCode | null,
): fromProfile is LanguageCode {
  return browserChoice === null && fromProfile !== null;
}

/**
 * The PUT body that changes the language and nothing else.
 *
 * Every other field is copied from the profile as it was last read. `user_md`
 * and `assistant_avatar_enabled` are deliberately absent: they are read-only on
 * this endpoint and the backend preserves them, so sending them back would be
 * claiming to write values this form does not own.
 */
export function languageOnlyProfile(
  profile: UserOnboardingProfile,
  lang: LanguageCode,
): UserOnboardingProfile {
  return {
    role: profile.role,
    goals: profile.goals,
    custom_instructions: profile.custom_instructions,
    preferred_language: lang,
    // Echoed rather than omitted: the wizard resubmits honorific every time and
    // the backend treats an absent one as "the user cleared it", so leaving it
    // out here would wipe a preference a language switch has no business
    // touching.
    ...(profile.honorific ? { honorific: profile.honorific } : {}),
  };
}

/**
 * Persist the chosen language onto the profile.
 *
 * Resolves either way — a failed write leaves the choice in this browser, which
 * is what happened before this function existed, so there is nothing for a
 * caller to recover from and nothing worth interrupting a reader over.
 */
export async function saveProfileLanguage(lang: LanguageCode): Promise<
  "saved" | "unchanged" | "not-personalized" | "failed"
> {
  try {
    const status = await getUserOnboardingStatus();

    if (!status.personalized || !status.profile) {
      return "not-personalized";
    }
    if (status.profile.preferred_language === lang) {
      return "unchanged";
    }

    await submitUserPersonalization(languageOnlyProfile(status.profile, lang));

    return "saved";
  } catch {
    return "failed";
  }
}
