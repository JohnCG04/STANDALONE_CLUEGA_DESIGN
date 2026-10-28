"use client";

import { useTranslate } from "@/hooks/useTranslate";
import type { OnboardingProfile } from "@/lib/onboarding/client";
import { onboardingOptionLabel } from "@/lib/onboarding/optionLabel";

/**
 * The onboarding wizard's answers, read back.
 *
 * Until this existed the ten structured fields were write-only: the wizard is
 * unreachable once the tenant profile exists (the backend derives `completed`
 * from that document existing), and the only surface that read the profile took
 * `cluega_md` off it and dropped the rest. So a company that mistyped its
 * industry had no way to even SEE what Cluega believed about it.
 *
 * Read-only on purpose. `cluega_md` — the rendered blob directly below this in
 * Settings → Profile — is the admin-owned, editable copy, and it is what the AI
 * actually reads. Making these fields editable too would create a second writer
 * for the same facts with no rule about which one wins.
 */

/** One label + value row. `children` renders the value however it is shaped. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1 py-2 max-sm:grid-cols-1">
      <dt className="text-[12px] text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="min-w-0 text-[13px] text-neutral-900 dark:text-neutral-100">
        {children}
      </dd>
    </div>
  );
}

/** Placeholder for a field the wizard left blank — shown rather than hidden, so
 *  "nothing was answered here" is visible instead of indistinguishable from a
 *  field that does not exist. */
function Unset() {
  const { t } = useTranslate();
  return (
    <span className="text-neutral-400 dark:text-neutral-500">
      {t("settings.profile.business.unset")}
    </span>
  );
}

function TextRow({ label, value }: { label: string; value?: string }) {
  const trimmed = value?.trim();
  return <Row label={label}>{trimmed ? trimmed : <Unset />}</Row>;
}

function ChipRow({
  label,
  values,
  group,
}: {
  label: string;
  values: string[] | undefined;
  group: Parameters<typeof onboardingOptionLabel>[1];
}) {
  const { t } = useTranslate();
  if (!values?.length) {
    return <Row label={label}>{<Unset />}</Row>;
  }
  return (
    <Row label={label}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[12px] text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
          >
            {onboardingOptionLabel(t, group, value)}
          </span>
        ))}
      </div>
    </Row>
  );
}

export function TenantBusinessProfile({
  profile,
}: {
  /** null when the tenant has never completed the wizard. */
  profile: OnboardingProfile | null;
}) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
        {t("settings.profile.business.title")}
      </div>
      {profile ? (
        <>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {/* Deliberately NOT the wizard's own `onboarding.fields.*` labels:
                those carry instructions for filling a form in ("Industry (pick
                one or more, or add your own)"), which reads as nonsense next to
                a value that is already filled in. */}
            <TextRow
              label={t("settings.profile.business.companyName")}
              value={profile.company_name}
            />
            <TextRow label={t("settings.profile.business.brand")} value={profile.brand} />
            <ChipRow
              label={t("settings.profile.business.industries")}
              values={profile.industries}
              group="industry"
            />
            <ChipRow
              label={t("settings.profile.business.marketingGoals")}
              values={profile.marketing_goals}
              group="marketingGoal"
            />
            <ChipRow
              label={t("settings.profile.business.channels")}
              values={profile.channels}
              group="channel"
            />
            <TextRow
              label={t("settings.profile.business.audience")}
              value={profile.audience}
            />
            <TextRow label={t("settings.profile.business.region")} value={profile.region} />
            <TextRow label={t("settings.profile.business.tone")} value={profile.tone} />
            <ChipRow
              label={t("settings.profile.business.hearAboutUs")}
              values={profile.hear_about_us}
              group="hearAboutUs"
            />
          </dl>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {t("settings.profile.business.hint")}
          </p>
        </>
      ) : (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-[12px] text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500">
          {t("settings.profile.business.empty")}
        </div>
      )}
    </div>
  );
}
