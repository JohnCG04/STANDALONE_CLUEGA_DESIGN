// Per-user onboarding API client — thin wrappers over cdpFetch for the second
// onboarding gate (personalization form + product tour). The CDP backend derives
// tenant + user from the JWT, so no ids are sent. State is per-user: members who
// join an already-onboarded tenant still complete their own form + tour.

import { cdpFetch } from "@/lib/cdp";
import type { Honorific } from "@/constants/user-onboarding-options";

// UserOnboardingProfile mirrors the stored per-user answers used to pre-fill the
// personalization form on re-open.
export type UserOnboardingProfile = {
  role: string;
  goals: string[];
  preferred_language: string;
  custom_instructions: string;
  /**
   * How the assistant should address this person — a preference, never gender.
   *
   * Optional on BOTH sides on purpose. It is absent from a GET whenever the
   * backend's persona flag is off or the user never answered, and it is omitted
   * from the submit body when unset, so a workspace running without the persona
   * feature never sees a key it does not know. Every existing caller that builds
   * this object keeps type-checking for the same reason.
   */
  honorific?: Honorific | "";
  // Per-user markdown surfaced on /account. Fully user-controlled: the wizard
  // seeds it once, then only the user edits it (the agent never writes it).
  // Read-only on GET responses; absent on wizard submit.
  user_md?: string;
  /**
   * Whether this person opted into the animated assistant avatar in
   * Settings -> Profile.
   *
   * Read-only here, exactly like `user_md`: it arrives on GET and is written
   * only by {@link updateAssistantAvatar}, never by the wizard's PUT — see
   * `personalizationAnswers`, which builds that body field by field.
   *
   * Absent means off. A user who never opted in and one who explicitly turned
   * it off want the same thing, so nothing downstream needs a tri-state.
   */
  assistant_avatar_enabled?: boolean;
};

// UserOnboardingStatus drives the gate: the two stages (form, tour) are tracked
// separately so an abandoned tour resumes at the tour rather than the form.
export type UserOnboardingStatus = {
  personalized: boolean;
  toured: boolean;
  profile: UserOnboardingProfile | null;
};

// getUserOnboardingStatus reports the current user's per-user onboarding progress.
export async function getUserOnboardingStatus(): Promise<UserOnboardingStatus> {
  return cdpFetch<UserOnboardingStatus>("/api/v1/onboarding/me", {
    method: "GET",
    auth: { kind: "auto" },
  });
}

// submitUserPersonalization stores the personalization answers and marks the form
// stage complete.
export async function submitUserPersonalization(
  answers: UserOnboardingProfile,
): Promise<UserOnboardingStatus> {
  return cdpFetch<UserOnboardingStatus>("/api/v1/onboarding/me", {
    method: "PUT",
    body: answers,
    auth: { kind: "auto" },
  });
}

// markTourComplete records that the user finished (or skipped) the product tour,
// releasing the gate.
export async function markTourComplete(): Promise<UserOnboardingStatus> {
  return cdpFetch<UserOnboardingStatus>("/api/v1/onboarding/me/tour-complete", {
    method: "POST",
    auth: { kind: "auto" },
  });
}

// updateUserMD persists the user's raw-edited per-user markdown (the /account
// editor). It writes only user_md and never re-renders from the personalization
// form; a blank value is rejected by the backend.
export async function updateUserMD(user_md: string): Promise<{ ok: boolean }> {
  return cdpFetch<{ ok: boolean }>("/api/v1/onboarding/me/md", {
    method: "PUT",
    body: { user_md },
    auth: { kind: "auto" },
  });
}

// updateAssistantAvatar persists the animated-assistant-avatar opt-in. A
// single-field write like updateUserMD above: it stores only
// assistant_avatar_enabled and leaves role, goals, honorific, user_md and
// memory_md untouched, so a chrome preference can never damage the answers the
// personalization wizard collected.
export async function updateAssistantAvatar(
  enabled: boolean,
): Promise<{ ok: boolean }> {
  return cdpFetch<{ ok: boolean }>("/api/v1/onboarding/me/assistant-avatar", {
    method: "PUT",
    body: { enabled },
    auth: { kind: "auto" },
  });
}
