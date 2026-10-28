"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Lightbulb, Loader2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { formatDateTime } from "@/lib/format/datetime";
import { getUserOnboardingStatus, type UserOnboardingProfile } from "@/lib/user-onboarding/client";
import {
  approveProfileProposal,
  formatProfileProposalValue,
  listPendingProfileProposals,
  profileFieldValue,
  rejectProfileProposal,
  type ProfileChangeProposal,
  type ProfileProposalField,
} from "@/lib/profile/profile-proposals";

type Decision = "approve" | "reject";

/** What an approval actually changed, read back from the server. */
type AppliedChange = { field: ProfileProposalField; value: string };

export function ProfileProposalReview({
  onApproved,
  onRejected,
}: {
  onApproved?: () => void;
  onRejected?: () => void;
} = {}) {
  const { t, lang } = useTranslate();
  const [proposals, setProposals] = useState<ProfileChangeProposal[]>([]);
  const [profile, setProfile] = useState<UserOnboardingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [busy, setBusy] = useState<{ id: string; decision: Decision } | null>(null);
  const [applied, setApplied] = useState<AppliedChange | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(false);
    const [proposalResult, profileResult] = await Promise.allSettled([
      listPendingProfileProposals(),
      getUserOnboardingStatus(),
    ]);
    const refreshed = profileResult.status === "fulfilled" ? profileResult.value.profile : null;
    if (profileResult.status === "fulfilled") {
      setProfile(refreshed);
    }
    if (proposalResult.status === "rejected") {
      setLoadError(true);
    } else {
      setProposals(proposalResult.value);
    }
    setLoading(false);
    return refreshed;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (proposal: ProfileChangeProposal, decision: Decision) => {
      setBusy({ id: proposal.id, decision });
      setActionError(false);
      setApplied(null);
      try {
        if (decision === "approve") {
          await approveProfileProposal(proposal.id);
          onApproved?.();
        } else {
          await rejectProfileProposal(proposal.id);
          onRejected?.();
        }
        setProposals((current) => current.filter((item) => item.id !== proposal.id));
        // Re-read before confirming anything: the value shown as applied comes
        // from the server's profile, not from the proposal we just sent, so the
        // confirmation cannot claim a change the backend did not make.
        const refreshed = await load(false);
        if (decision === "approve") {
          setApplied({
            field: proposal.field,
            value: formatProfileProposalValue(
              profileFieldValue(refreshed, proposal.field, proposal.proposedValue),
            ),
          });
        }
      } catch {
        setActionError(true);
      } finally {
        setBusy(null);
      }
    },
    [load, onApproved, onRejected],
  );

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
          <Lightbulb className="size-4" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("settings.profile.proposals.title")}
          </h3>
          <p className="mt-1 text-[12px] font-medium leading-5 text-neutral-500 dark:text-neutral-400">
            {t("settings.profile.proposals.description")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-[12px] font-semibold text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <Loader2 className="size-4 animate-spin" />
          {t("settings.profile.proposals.loading")}
        </div>
      ) : loadError ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <p className="text-[12px] font-medium text-rose-700 dark:text-rose-300">
            {t("settings.profile.proposals.loadError")}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-rose-700 hover:underline dark:text-rose-300"
          >
            <RotateCcw className="size-3.5" />
            {t("settings.profile.proposals.retry")}
          </button>
        </div>
      ) : proposals.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-neutral-200 px-4 py-4 text-center text-[12px] font-medium text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {t("settings.profile.proposals.empty")}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">
            {proposals.length === 1
              ? t("settings.profile.proposals.countOne")
              : t("settings.profile.proposals.countMany").replace("{count}", String(proposals.length))}
          </p>
          {proposals.map((proposal) => {
            const currentValue = formatProfileProposalValue(
              profileFieldValue(profile, proposal.field, proposal.currentValue),
            ) || t("settings.profile.proposals.notSet");
            const proposedValue =
              formatProfileProposalValue(proposal.proposedValue) || t("settings.profile.proposals.notSet");
            const isBusy = busy?.id === proposal.id;
            return (
              <article key={proposal.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                      {t(`settings.profile.proposals.fields.${proposal.field}`)}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {proposal.sourceTitle
                        ? `${t("settings.profile.proposals.source")} ${proposal.sourceTitle} · `
                        : ""}
                      {formatDateTime(proposal.createdAt, lang)}
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    {t("settings.profile.proposals.pending")}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-900">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      {t("settings.profile.proposals.current")}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-[12px] font-medium text-neutral-700 dark:text-neutral-300">
                      {currentValue}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-500/10">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                      {t("settings.profile.proposals.proposed")}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
                      {proposedValue}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void decide(proposal, "reject")}
                    className="gap-1.5 text-[12px] font-semibold"
                  >
                    {isBusy && busy.decision === "reject" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    {t("settings.profile.proposals.reject")}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void decide(proposal, "approve")}
                    className="gap-1.5 text-[12px] font-semibold"
                  >
                    {isBusy && busy.decision === "approve" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {t("settings.profile.proposals.approve")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* An approval writes the structured profile field. `user.md` below is raw
          text the user owns — the backend never rewrites it — so saying so here
          is what makes an unchanged user.md legible instead of looking stale. */}
      {applied ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <div>
            <p className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
              {t("settings.profile.proposals.applied")}
              {": "}
              {t(`settings.profile.proposals.fields.${applied.field}`)}
              {" — "}
              {applied.value || t("settings.profile.proposals.notSet")}
            </p>
            <p className="mt-1 text-[11px] font-medium leading-5 text-emerald-700 dark:text-emerald-300/90">
              {t("settings.profile.proposals.appliedNote")}
            </p>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-3 text-right text-[12px] font-medium text-rose-600 dark:text-rose-300">
          {t("settings.profile.proposals.actionError")}
        </p>
      ) : null}
    </section>
  );
}
