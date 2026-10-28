/**
 * Which of a batch of picked assets the composer accepts, and what they evict.
 *
 * Pure so it can be asserted without a store or a DOM: the store applies the
 * decision, it does not make it.
 *
 * Two budgets apply at once. `cap` is the surface-wide ceiling (chat's is "any 2
 * combined", which cannot be expressed per-role), and `roleCaps` is the PRD's
 * per-role budget the creative module publishes. A role budgeted at exactly one
 * REPLACES what occupies it — picking a different trend is the replace gesture —
 * while a full multi-slot role rejects the extra pick instead of evicting.
 */

import {
  mintMentionName,
  roleReplacesOnFull,
  type AttachmentRole,
  type RoleCaps,
} from "./attachmentRoles";

export type AdmissionCandidate = {
  role: AttachmentRole;
};

export type AdmissionSlot = {
  /** Index of the candidate in the input array. */
  index: number;
  role: AttachmentRole;
  /** `@name` for the asset, given what it will sit alongside. */
  mentionName: string;
};

export type AdmissionDecision = {
  admitted: AdmissionSlot[];
  /** Ids to drop: the previous occupants of single-slot roles. */
  evictedIds: string[];
  /** Candidate indexes that did not fit. */
  rejected: number[];
};

type Held = { id: string; role: AttachmentRole };

export function admitAttachments(
  held: readonly Held[],
  candidates: readonly AdmissionCandidate[],
  { cap, roleCaps }: { cap: number; roleCaps: RoleCaps | null },
): AdmissionDecision {
  let working = [...held];
  const evictedIds: string[] = [];
  const admitted: AdmissionSlot[] = [];
  const rejected: number[] = [];

  candidates.forEach((candidate, index) => {
    const { role } = candidate;
    const roleCap = roleCaps?.[role];

    // A role explicitly budgeted at 0 is not available on this surface at all.
    if (roleCap === 0) {
      rejected.push(index);
      return;
    }

    // Replace-on-pick, but only while the budget really is one: with room for
    // several, evicting the first would be silent data loss rather than the
    // "choose a different one" gesture.
    if (roleReplacesOnFull(role, roleCaps)) {
      const existing = working.find((item) => item.role === role);
      if (existing) {
        evictedIds.push(existing.id);
        working = working.filter((item) => item.id !== existing.id);
      }
    }

    const usedForRole = working.filter((item) => item.role === role).length;
    if (roleCap !== undefined && usedForRole >= roleCap) {
      rejected.push(index);
      return;
    }
    if (working.length >= cap) {
      rejected.push(index);
      return;
    }

    const mentionName = mintMentionName(role, usedForRole + 1);
    admitted.push({ index, role, mentionName });
    // A placeholder id keeps the running totals honest for the rest of the batch.
    working = [...working, { id: `pending_${index}`, role }];
  });

  return { admitted, evictedIds, rejected };
}
