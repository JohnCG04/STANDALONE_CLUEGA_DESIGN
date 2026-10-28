"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import {
  PLATFORM_PROFILE_QUERY_KEY,
  updateCurrentPlatformProfileDisplayName,
} from "@/lib/platform/profile";
import { userOnboardingStatusQuery } from "@/lib/user-onboarding/queries";
import { roleLabel } from "@/lib/user-onboarding/role-label";

/**
 * The display name (editable) and occupation (read-only: the role the person
 * gave during onboarding) pair, with its own save.
 *
 * The value lives in the parent because the identity header above shows the
 * name as typed; the WRITE lives here, so the tab does not carry a save handler
 * that only one field uses. `onSaved` reports the name the platform actually
 * stored back to the parent, which is what clears the dirty state and raises
 * the confirmation.
 */
export function ProfileNameFields({
  displayName,
  savedDisplayName,
  onDisplayNameChange,
  onSaved,
}: {
  displayName: string;
  savedDisplayName: string;
  onDisplayNameChange: (value: string) => void;
  onSaved: (storedDisplayName: string) => void;
}) {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onboarding = useQuery(userOnboardingStatusQuery);
  const occupation = roleLabel(onboarding.data?.profile?.role, t);
  // Three different empties, three different words: still asking (none — a
  // "Not set yet" that then fills in reads as the answer changing), could not
  // ask, and asked but never answered.
  const occupationPlaceholder = onboarding.isPending
    ? ""
    : onboarding.isError
      ? t("settings.profile.occupationUnavailable")
      : t("settings.profile.occupationPlaceholder");

  const isDirty = displayName.trim() !== savedDisplayName.trim();

  const handleSave = async () => {
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setSaveError(t("settings.profile.displayNameRequired"));
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const profile = await updateCurrentPlatformProfileDisplayName(nextDisplayName);
      // The profile is cached now, so the new name would otherwise stay invisible
      // to every other surface reading useCurrentUser until the cache went stale.
      await queryClient.invalidateQueries({
        queryKey: PLATFORM_PROFILE_QUERY_KEY,
      });
      onSaved(profile.displayName);
    } catch {
      setSaveError(t("settings.profile.displayNameSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-2 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("settings.profile.displayName")}
          </div>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder={t("settings.profile.displayNamePlaceholder")}
            className="h-10 w-full rounded-lg border border-transparent bg-neutral-100 px-3 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:outline-none dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-700 dark:focus:bg-neutral-950 font-semibold"
          />
        </div>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("settings.profile.occupation")}
          </div>
          {/* The role from the onboarding form ("Your role"), the one stored
              answer that means occupation. Read-only here: it is changed through
              the personalization form or an approved profile proposal. Never a
              stand-in value — the field once rendered a literal "Others", which
              every user read as their own answer. */}
          <input
            type="text"
            value={occupation}
            placeholder={occupationPlaceholder}
            readOnly
            className="h-10 w-full rounded-lg border border-transparent bg-neutral-100 px-3 text-[13px] font-semibold text-neutral-500 placeholder:text-neutral-400 focus:outline-none dark:bg-neutral-900 dark:text-neutral-400 dark:placeholder:text-neutral-500"
          />
        </div>
      </div>

      {isDirty && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onDisplayNameChange(savedDisplayName);
              setSaveError(null);
            }}
            className="h-9 rounded-md border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900"
          >
            {t("settings.common.cancel")}
          </button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="text-[13px] font-semibold"
          >
            {isSaving ? t("settings.common.saving") : t("settings.common.save")}
          </Button>
        </div>
      )}
      {saveError ? (
        <div className="text-right text-[12px] font-medium text-rose-500">
          {saveError}
        </div>
      ) : null}
    </div>
  );
}
