import { useCallback, useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { startConnect } from "@/lib/integrations/client";
import type { IntegrationServiceID } from "@/lib/integrations/types";
import type { SocialPlatform } from "@/lib/social-posts/client";
import { useToastStore } from "@/lib/stores/useToastStore";

/** Which connection grants posting on each platform. TikTok has a Login Kit
 *  connection of its own; Facebook rides the Meta connection the ads
 *  integration uses, asking for posting to Pages (`profile=publishing`) instead
 *  of the ads permissions. A platform missing here cannot be connected from the
 *  panel. */
const CONNECT_BY_PLATFORM: Partial<
  Record<SocialPlatform, { service: IntegrationServiceID; params?: Record<string, string> }>
> = {
  tiktok: { service: "tiktokAccount" },
  facebook: { service: "meta", params: { profile: "publishing" } },
};

/**
 * Direct connect from the posting panel — the same OAuth entry point the
 * integrations page and the chat offer card use (startConnect → full-page
 * redirect to the provider), so the user is not detoured through
 * an integrations page first. The return_url points back at the page it was
 * opened on, query dropped so a one-shot handoff param can't replay; after the
 * round trip the panel is reopened from the node and the linked badge re-checks
 * on open.
 */
export function useConnectSocial() {
  const { t } = useTranslate();
  const pushToast = useToastStore((s) => s.push);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(
    (platform: SocialPlatform) => {
      const target = CONNECT_BY_PLATFORM[platform];
      if (connecting || !target) return;
      setConnecting(true);
      const returnURL = `${window.location.origin}${window.location.pathname}`;
      void startConnect(target.service, returnURL, undefined, target.params)
        .then((response) => {
          if (response?.authorizationURL) {
            window.location.assign(response.authorizationURL);
            return;
          }
          setConnecting(false);
          pushToast(t("appChat.socialPost.connectFailed"), "error");
        })
        .catch(() => {
          setConnecting(false);
          pushToast(t("appChat.socialPost.connectFailed"), "error");
        });
    },
    [connecting, pushToast, t],
  );

  return { connecting, connect };
}
