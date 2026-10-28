// Onboarding API client — thin wrappers over cdpFetch for the marketing
// onboarding wizard. The CDP backend derives tenant + user from the JWT, so no
// ids are sent.
//
// Onboarding is TENANT-level, and there is no per-user completion flag anywhere
// — not in the API, not in Mongo. `completed` is derived: the backend reports it
// as "the tenant_profile document exists" (usecase/onboarding/service.go,
// GetStatus). So the first member to finish the wizard onboards the whole
// tenant, and every later member skips it having answered nothing.

import { cdpFetch } from "@/lib/cdp";

// OnboardingProfile mirrors the stored tenant answers used to pre-fill the
// wizard for a later user in an already-onboarded tenant.
export type OnboardingProfile = {
  company_name: string;
  // Persona keys: the brand name to speak as and the voice/tone the AI agent
  // should use in replies + generated copy. Optional; drive AI generation only.
  brand?: string;
  tone?: string;
  industries: string[];
  marketing_goals: string[];
  channels: string[];
  audience: string;
  region: string;
  locale: string;
  hear_about_us: string[];
  // Tenant business-context markdown surfaced on /account (read-only for members,
  // raw-editable for admins). Read-only on GET responses; absent on wizard submit.
  cluega_md?: string;
};

export type OnboardingStatus = {
  completed: boolean;
  profile: OnboardingProfile | null;
  // is_admin tells the UI whether the caller may raw-edit cluega_md.
  is_admin: boolean;
  org_role?: string;
};

// getOnboardingStatus returns whether the current user has onboarded and the
// existing tenant profile (null when the tenant has never onboarded).
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return cdpFetch<OnboardingStatus>("/api/v1/onboarding", {
    method: "GET",
    auth: { kind: "auto" },
  });
}

// submitOnboarding stores the wizard answers and marks the user complete.
export async function submitOnboarding(
  answers: OnboardingProfile,
): Promise<OnboardingStatus> {
  return cdpFetch<OnboardingStatus>("/api/v1/onboarding", {
    method: "PUT",
    body: answers,
    auth: { kind: "auto" },
  });
}

// updateClueGaMD persists an admin's raw-edited tenant business-context markdown
// (admin-only; the backend returns 403 for non-admins). It writes only cluega_md
// and never re-renders from the wizard answers.
export async function updateClueGaMD(cluega_md: string): Promise<{ ok: boolean }> {
  return cdpFetch<{ ok: boolean }>("/api/v1/onboarding/md", {
    method: "PUT",
    body: { cluega_md },
    auth: { kind: "auto" },
  });
}
