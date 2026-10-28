"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMessage } from "@/components/cluega-ai/MarkdownMessage";
import {
  getUserOnboardingStatus,
  updateUserMD,
} from "@/lib/user-onboarding/client";
import {
  getOnboardingStatus,
  updateClueGaMD,
  type OnboardingProfile,
} from "@/lib/onboarding/client";
import { mergeServerMarkdown } from "@/lib/profile/markdownFieldState";
import { TenantBusinessProfile } from "@/components/settings/TenantBusinessProfile";

// Mirrors domain.MaxProfileWords on the CDP backend: both md's are capped to this
// many words on save, so the counter warns before the backend trims.
const WORD_CAP = 1500;

const wordCount = (s: string): number => {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
};

type FieldProps = {
  label: string;
  hint: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel?: () => void;
  saving: boolean;
  dirty: boolean;
  saved: boolean;
  error: string | null;
};

// MarkdownField renders one raw-editable markdown block (editable) or a read-only
// rendered view (members viewing cluega_md). Pure presentation; the parent owns
// the data + persistence so both fields share one shape.
function MarkdownField({
  label,
  hint,
  value,
  editable,
  onChange,
  onSave,
  onCancel,
  saving,
  dirty,
  saved,
  error,
}: FieldProps) {
  const { t } = useTranslate();
  const words = wordCount(value);
  const over = words > WORD_CAP;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
        {label}
      </div>
      {editable ? (
        <Textarea
          rows={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-48 font-mono text-[12px]"
        />
      ) : (
        <div className="min-h-24 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          {value.trim() ? (
            <MarkdownMessage content={value} />
          ) : (
            <span className="text-[12px] text-neutral-400">
              {t("settings.profile.context.empty")}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {hint}
        </span>
        <span
          className={
            over
              ? "text-[11px] font-semibold text-rose-500"
              : "text-[11px] font-semibold text-neutral-400 dark:text-neutral-500"
          }
        >
          {t("settings.profile.context.wordCounter").replace(
            "{count}",
            String(words),
          )}
        </span>
      </div>
      {over ? (
        <div className="text-[11px] text-rose-500">
          {t("settings.profile.context.overLimit")}
        </div>
      ) : null}
      {editable && (dirty || error) ? (
        <div className="flex items-center justify-end gap-2">
          {error ? (
            <span className="text-[12px] text-rose-500">{error}</span>
          ) : null}
          {dirty && (
            <>
              {onCancel && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onCancel}
                  className="h-9 rounded-md border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900"
                >
                  {t("settings.common.cancel")}
                </button>
              )}
              <Button
                type="button"
                disabled={!value.trim() || saving}
                onClick={onSave}
                variant="primary"
                className="text-[13px] font-semibold"
              >
                {t("settings.common.save")}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// AccountContextEditor surfaces the two markdown blocks the AI agent injects into
// every chat: the per-user user_md (always user-editable) and the tenant-wide
// cluega_md (admin-editable, read-only for members). Each persists independently.
export function AccountContextEditor({
  onSaveSuccess,
  refreshToken,
}: {
  onSaveSuccess?: () => void;
  /**
   * Bump to re-read the authoritative profile. The page has other things that
   * change it — approving a profile suggestion is the reason this exists — and
   * without a re-read this editor kept showing whatever it fetched on mount,
   * which reads as "my change was not applied".
   *
   * A token rather than a copy of the new value: the server stays the single
   * source of truth, so there is no second client-side profile to drift.
   */
  refreshToken?: number;
} = {}) {
  const { t } = useTranslate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // The wizard's structured answers, shown read-only above cluega_md. Read off
  // the SAME getOnboardingStatus() response that already supplies cluega_md and
  // is_admin — the payload always carried these ten fields, the UI just threw
  // them away, so surfacing them costs no extra request.
  const [businessProfile, setBusinessProfile] = useState<OnboardingProfile | null>(null);
  const [userMd, setUserMd] = useState({ saved: "", draft: "", saving: false, ok: false, err: null as string | null });
  const [cluegaMd, setCluegaMd] = useState({ saved: "", draft: "", saving: false, ok: false, err: null as string | null });

  // Re-reading is folded in through mergeServerMarkdown rather than assigned:
  // a refresh must not overwrite an edit the user has not saved yet.
  const read = useCallback(async (alive: () => boolean) => {
    const [me, tenant] = await Promise.allSettled([
      getUserOnboardingStatus(),
      getOnboardingStatus(),
    ]);
    if (!alive()) return;
    if (me.status === "fulfilled") {
      const md = me.value.profile?.user_md ?? "";
      setUserMd((s) => mergeServerMarkdown(s, md));
    }
    if (tenant.status === "fulfilled") {
      const md = tenant.value.profile?.cluega_md ?? "";
      setCluegaMd((s) => mergeServerMarkdown(s, md));
      setIsAdmin(Boolean(tenant.value.is_admin));
      setBusinessProfile(tenant.value.profile);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void read(() => alive);
    return () => {
      alive = false;
    };
  }, [read, refreshToken]);

  const save = async (
    set: typeof setUserMd,
    draft: string,
    writer: (md: string) => Promise<{ ok: boolean }>,
  ) => {
    set((s) => ({ ...s, saving: true, err: null }));
    try {
      await writer(draft);
      set((s) => ({ ...s, saving: false, saved: draft, ok: true }));
      onSaveSuccess?.();
    } catch {
      set((s) => ({ ...s, saving: false, err: t("settings.profile.context.saveError") }));
    }
  };

  if (loading) {
    return (
      <div className="text-[12px] text-neutral-400">
        {t("settings.profile.context.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        {t("settings.profile.context.title")}
      </div>
      <MarkdownField
        label={t("settings.profile.context.userMdLabel")}
        hint={t("settings.profile.context.userMdHint")}
        value={userMd.draft}
        editable
        onChange={(v) => setUserMd((s) => ({ ...s, draft: v, ok: false }))}
        onSave={() => save(setUserMd, userMd.draft, updateUserMD)}
        onCancel={() => setUserMd((s) => ({ ...s, draft: s.saved, ok: false }))}
        saving={userMd.saving}
        dirty={userMd.draft !== userMd.saved}
        saved={userMd.ok}
        error={userMd.err}
      />
      {/* Above cluega_md, because the markdown below is RENDERED FROM these
          answers on first submit — reading them in the other order makes the
          blob look like it came from nowhere. */}
      <TenantBusinessProfile profile={businessProfile} />
      <MarkdownField
        label={t("settings.profile.context.cluegaMdLabel")}
        hint={
          isAdmin
            ? t("settings.profile.context.cluegaMdHintAdmin")
            : t("settings.profile.context.cluegaMdHintMember")
        }
        value={cluegaMd.draft}
        editable={isAdmin}
        onChange={(v) => setCluegaMd((s) => ({ ...s, draft: v, ok: false }))}
        onSave={() => save(setCluegaMd, cluegaMd.draft, updateClueGaMD)}
        onCancel={() => setCluegaMd((s) => ({ ...s, draft: s.saved, ok: false }))}
        saving={cluegaMd.saving}
        dirty={cluegaMd.draft !== cluegaMd.saved}
        saved={cluegaMd.ok}
        error={cluegaMd.err}
      />
    </div>
  );
}
