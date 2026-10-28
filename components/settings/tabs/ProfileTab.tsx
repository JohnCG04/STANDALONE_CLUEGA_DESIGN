"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { USER_ONBOARDING_STATUS_QUERY_KEY } from "@/lib/user-onboarding/queries";
import { AccountContextEditor } from "../AccountContextEditor";
import { AssistantAvatarRow } from "../AssistantAvatarRow";
import { ProfileProposalReview } from "../ProfileProposalReview";
import { ProfileIdentityHeader } from "./profile/ProfileIdentityHeader";
import { ProfileNameFields } from "./profile/ProfileNameFields";
import { ProfilePlanCard } from "./profile/ProfilePlanCard";
import { ProfileSavedToast } from "./profile/ProfileSavedToast";

/**
 * The Profile settings tab: identity, plan, the editable name, the assistant
 * preferences, and the context blocks the agent reads.
 *
 * The tab owns only what more than one child needs — the display-name value
 * (the header renders it as typed while the input is dirty) and the one shared
 * confirmation toast. Everything else, including each preference's own
 * persistence, lives in its own file; the preferences here deliberately do NOT
 * share the display name's save, which is gated on the display name's own dirty
 * check.
 */
export function ProfileTab() {
  const { t } = useTranslate();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isHiding, setIsHiding] = useState(false);
  // Bumped when something on this tab changes the stored profile, so the context
  // editor below re-reads the authoritative copy instead of showing what it
  // fetched on mount.
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);

  useEffect(() => {
    if (me.displayName) {
      setSavedDisplayName(me.displayName);
      setDisplayName(me.displayName);
    }
  }, [me.displayName]);

  // Handle toast lifecycle & exit animation
  useEffect(() => {
    if (!toastMessage) return;
    const hideTimer = setTimeout(() => {
      setIsHiding(true);
      const unmountTimer = setTimeout(() => {
        setToastMessage(null);
        setIsHiding(false);
      }, 250);
      return () => clearTimeout(unmountTimer);
    }, 3000);
    return () => clearTimeout(hideTimer);
  }, [toastMessage]);

  const showSuccessToast = (message = t("settings.profile.updatedToast")) => {
    setIsHiding(false);
    setToastMessage(message);
  };

  return (
    <div className="relative flex flex-col gap-6">
      {toastMessage && (
        <ProfileSavedToast isHiding={isHiding} message={toastMessage} />
      )}

      <ProfileIdentityHeader displayName={displayName} />

      <ProfilePlanCard />

      <ProfileNameFields
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        onSaved={(storedDisplayName) => {
          setSavedDisplayName(storedDisplayName);
          setDisplayName(storedDisplayName);
          showSuccessToast();
        }}
        savedDisplayName={savedDisplayName}
      />

      {/* Assistant preferences. Renders nothing while the persona feature is
          off, which is the default — so this tab is unchanged until a user opts
          in. */}
      <AssistantAvatarRow />

      <div className="border-t border-neutral-200 dark:border-neutral-800" />

      <ProfileProposalReview
        onApproved={() => {
          showSuccessToast(t("settings.profile.proposals.approvedToast"));
          setProfileRefreshToken((token) => token + 1);
          // An approved proposal can change the role the Occupation field shows.
          void queryClient.invalidateQueries({ queryKey: USER_ONBOARDING_STATUS_QUERY_KEY });
        }}
        onRejected={() => showSuccessToast(t("settings.profile.proposals.rejectedToast"))}
      />

      <div className="border-t border-neutral-200 dark:border-neutral-800" />

      {/* Raw-editable context the AI agent injects into every chat. */}
      <AccountContextEditor onSaveSuccess={showSuccessToast} refreshToken={profileRefreshToken} />
    </div>
  );
}
