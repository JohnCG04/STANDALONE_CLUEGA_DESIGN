"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

import { COOKIE_CONSENT_CHANGE_EVENT, hasAnalyticsConsent } from "@/lib/cookie-consent";

// Pages no tag may run on, whatever the consent: see the note below.
const NO_TAGS_PATH_PREFIX = "/secure/";

/**
 * Google Tag Manager, loaded only after the visitor consents to analytics.
 *
 * It used to be rendered unconditionally in the root layout, which meant the
 * container — and every measurement tag inside it — ran before anyone was
 * asked. A cookie banner in front of a tag that has already fired is not
 * consent, it is a notice, and for an EU visitor that is the difference.
 *
 * Rendering NOTHING until consent, rather than loading GTM in a denied
 * Consent Mode state, is the stricter reading and the one that survives
 * someone adding a tag to the container that does not respect Consent Mode.
 *
 * Consent is re-read on `COOKIE_CONSENT_CHANGE_EVENT`, so accepting in the
 * banner starts measurement on the spot — no reload, and no "the first page
 * view is always missing" gap. Withdrawal cannot unload an already-running
 * container, so the stored decision also purges its cookies; the tag is gone
 * on the next page load.
 *
 * Never on /secure/* (the hosted Telegram sign-in, IM02-074): a sign-in code
 * or password typed there must not be within reach of any tag, consent or not.
 * Those pages are reached by a full page load, so no container from an earlier
 * page is still running on them. The app opens that sign-in as a dialog, but the
 * dialog holds the /secure/ page in a frame (a page load of its own, so this
 * check applies to it); rendering the form in the app's own document would
 * put it where the container runs.
 */
export function GoogleTagManager({ containerId }: { containerId: string }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () =>
      setAllowed(hasAnalyticsConsent() && !window.location.pathname.startsWith(NO_TAGS_PATH_PREFIX));
    sync();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, sync);
  }, []);

  if (!containerId || !allowed) {
    return null;
  }

  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${containerId}');`}
    </Script>
  );
}
