"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { canContinueToCompose } from "@/resources/app/pages/app/components/SocialPost/helpers";
import { PlatformStep } from "@/resources/app/pages/app/components/SocialPost/PlatformStep";
import { useSocialPost } from "@/resources/app/pages/app/components/SocialPost/storeContext";
import { useConnectSocial } from "@/resources/app/pages/app/components/SocialPost/useConnectSocial";
import { useSocialAccounts } from "@/resources/app/pages/app/components/SocialPost/useSocialAccounts";

import { STICKY_FOOTER_CLASS } from "../constants";

/** Step 1 inside the node, as in the drawer: pick the platforms, then continue to compose. */
export function NodePlatformStep({ readOnly }: { readOnly: boolean }) {
  const { t } = useTranslate();
  const selectedAssets = useSocialPost((s) => s.selectedAssets);
  const selectedPlatforms = useSocialPost((s) => s.selectedPlatforms);
  const togglePlatform = useSocialPost((s) => s.togglePlatform);
  const setStep = useSocialPost((s) => s.setStep);
  const { accounts, platforms, loading, failed, reload } = useSocialAccounts(!readOnly);
  // No conversation here: the OAuth round trip comes back to this workflow's page.
  const { connecting, connect } = useConnectSocial();

  return (
    <>
      <PlatformStep
        accounts={accounts}
        connecting={connecting}
        failed={failed}
        loading={loading}
        onConnect={connect}
        onReload={reload}
        onToggle={togglePlatform}
        platforms={platforms}
        selectedAssets={selectedAssets}
        selectedPlatforms={selectedPlatforms}
      />
      <div className={STICKY_FOOTER_CLASS}>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            size="pillCompact"
            disabled={readOnly || !canContinueToCompose(selectedPlatforms)}
            onClick={() => setStep("compose")}
          >
            {t("appChat.socialPost.continueStep")}
            <ArrowRight className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </>
  );
}
