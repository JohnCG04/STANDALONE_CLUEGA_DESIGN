"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { SocialPostNodeBodyProps } from "@dogclaw-ad/workflow";
import { useQueryClient } from "@tanstack/react-query";

import { useTranslate } from "@/hooks/useTranslate";
import type { SocialPostRecord } from "@/lib/social-posts/client";
import { ComposeBody } from "@/resources/app/pages/app/components/SocialPost/components/ComposeBody";
import { ComposeFooter } from "@/resources/app/pages/app/components/SocialPost/components/ComposeFooter";
import { PublishModeNotice } from "@/resources/app/pages/app/components/SocialPost/components/PublishModeNotice";
import { composeBlockedReason } from "@/resources/app/pages/app/components/SocialPost/helpers";
import { useComposeController } from "@/resources/app/pages/app/components/SocialPost/hooks/useComposeController";
import { useSocialPost } from "@/resources/app/pages/app/components/SocialPost/storeContext";

import { CONFIRM_REPOST_MS, STICKY_FOOTER_CLASS } from "../constants";
import { withPost } from "../helpers";
import { socialPostQueryKey } from "../hooks/usePostStatuses";
import { useRestoreAccounts } from "../hooks/useRestoreAccounts";

export interface NodeComposeStepProps {
  nodeId: string;
  onDataChange: SocialPostNodeBodyProps["onDataChange"];
  readOnly: boolean;
  /** Saved accounts not ticked yet; they come back instead of the drawer's pre-selection. */
  pendingKeys: RefObject<string[]>;
  preselect: boolean;
  /** The node already sent a post, so another press would publish a second one. */
  posted: boolean;
  hasMedia: boolean;
  onDiscard: () => void;
}

/** Step 2 inside the node: the drawer's own form and footer, with a confirm before reposting. */
export function NodeComposeStep({
  nodeId,
  onDataChange,
  readOnly,
  pendingKeys,
  preselect,
  posted,
  hasMedia,
  onDiscard,
}: NodeComposeStepProps) {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const setStep = useSocialPost((s) => s.setStep);
  const [armed, setArmed] = useState(false);

  const onSubmitted = useCallback(
    (record: SocialPostRecord) => {
      queryClient.setQueryData(socialPostQueryKey(record.id), record);
      const at = record.createdAt ?? new Date().toISOString();
      onDataChange((prev) => withPost(prev, nodeId, { id: record.id, at }));
    },
    [queryClient, onDataChange, nodeId],
  );

  const controller = useComposeController({ active: !readOnly, preselect, onSubmitted });
  useRestoreAccounts(controller, pendingKeys);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_REPOST_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const onSubmit = () => {
    if (posted && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    void controller.submit();
  };

  return (
    <>
      <PublishModeNotice creator={controller.creator} />
      <ComposeBody controller={controller} />
      <div className={STICKY_FOOTER_CLASS}>
        <ComposeFooter
          controller={controller}
          blockedReason={
            hasMedia
              ? composeBlockedReason(controller, t)
              : t("appChat.socialPost.node.mediaEmpty")
          }
          onBack={() => setStep("platform")}
          onDiscard={onDiscard}
          onSubmit={onSubmit}
          submitLabel={
            armed
              ? t("appChat.socialPost.node.confirmPostAgain")
              : posted
                ? t("appChat.socialPost.node.postAgain")
                : undefined
          }
        />
      </div>
    </>
  );
}
