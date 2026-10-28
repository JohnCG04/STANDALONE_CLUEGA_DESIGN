import { cdpFetch } from "@/lib/cdp";

import type { UserOnboardingProfile } from "@/lib/user-onboarding/client";

export type ProfileProposalField =
  | "role"
  | "goals"
  | "preferred_language"
  | "custom_instructions";

export type ProfileProposalValue = string | string[];

export type ProfileChangeProposal = {
  id: string;
  field: ProfileProposalField;
  currentValue: ProfileProposalValue;
  proposedValue: ProfileProposalValue;
  status: "pending" | "approved" | "rejected";
  sourceTitle?: string;
  createdAt: string;
  decidedAt?: string;
};

type RawProposal = {
  id?: unknown;
  field?: unknown;
  current_value?: unknown;
  proposed_value?: unknown;
  status?: unknown;
  provenance?: { source_title?: unknown };
  created_at?: unknown;
  decided_at?: unknown;
};

const PROFILE_FIELDS = new Set<ProfileProposalField>([
  "role",
  "goals",
  "preferred_language",
  "custom_instructions",
]);

function profileValue(value: unknown): ProfileProposalValue {
  if (Array.isArray(value)) return value.map(String);
  return value == null ? "" : String(value);
}

export function mapProfileProposal(raw: RawProposal): ProfileChangeProposal {
  const field = String(raw.field ?? "") as ProfileProposalField;
  if (!PROFILE_FIELDS.has(field)) {
    throw new Error("unsupported profile proposal field");
  }
  const status = String(raw.status ?? "pending") as ProfileChangeProposal["status"];
  if (!(["pending", "approved", "rejected"] as const).includes(status)) {
    throw new Error("unsupported profile proposal status");
  }
  const sourceTitle = raw.provenance?.source_title;
  const decidedAt = raw.decided_at;
  return {
    id: String(raw.id ?? ""),
    field,
    currentValue: profileValue(raw.current_value),
    proposedValue: profileValue(raw.proposed_value),
    status,
    sourceTitle: sourceTitle ? String(sourceTitle) : undefined,
    createdAt: String(raw.created_at ?? ""),
    decidedAt: decidedAt ? String(decidedAt) : undefined,
  };
}

export function formatProfileProposalValue(value: ProfileProposalValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * Reads one proposal field off the authoritative profile.
 *
 * Approving a proposal writes the structured profile field on the backend, so
 * this — not the proposal's own `currentValue`, which is a snapshot taken when
 * the suggestion was made — is what proves the change landed. The proposal's
 * value is the fallback for the case where the profile has not loaded.
 */
export function profileFieldValue(
  profile: UserOnboardingProfile | null,
  field: ProfileProposalField,
  fallback: ProfileProposalValue,
): ProfileProposalValue {
  if (!profile) return fallback;
  if (field === "preferred_language") return profile.preferred_language;
  if (field === "custom_instructions") return profile.custom_instructions;
  return profile[field];
}

export async function listPendingProfileProposals(): Promise<ProfileChangeProposal[]> {
  const data = await cdpFetch<RawProposal[]>("/api/v1/profile-change-proposals", {
    method: "GET",
    searchParams: { status: "pending" },
    auth: { kind: "auto" },
  });
  return (data ?? []).map(mapProfileProposal);
}

async function decideProfileProposal(
  id: string,
  decision: "approve" | "reject",
): Promise<ProfileChangeProposal> {
  const data = await cdpFetch<RawProposal>(
    `/api/v1/profile-change-proposals/${encodeURIComponent(id)}/${decision}`,
    { method: "POST", auth: { kind: "auto" } },
  );
  return mapProfileProposal(data);
}

export function approveProfileProposal(id: string): Promise<ProfileChangeProposal> {
  return decideProfileProposal(id, "approve");
}

export function rejectProfileProposal(id: string): Promise<ProfileChangeProposal> {
  return decideProfileProposal(id, "reject");
}
