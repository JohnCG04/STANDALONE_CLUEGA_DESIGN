"use client";

import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Mail } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Social / SSO sign-in is shipped as "coming soon" and stays hidden until the
// release that turns it on. Restore the imports together with the button block
// further down (search for "COMING SOON SIGN-IN").
// import { AppleIcon } from "@/components/login/AppleIcon";
// import { ComingSoonBadge } from "@/components/login/ComingSoonBadge";
// import { GoogleIcon } from "@/components/login/GoogleIcon";
import { LoginPageFallback } from "@/components/login/LoginPageFallback";
import { TurnstileWidget } from "@/components/login/TurnstileWidget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/Card";
import { Separator } from "@/components/ui/separator";
import { isTurnstileEnabled } from "@/config/turnstile";
import { useHelpHref } from "@/hooks/useHelpHref";
import { useTranslate } from "@/hooks/useTranslate";
import { APP_HOME_PATH, getSafeAppReturnPath } from "@/lib/app-auth-paths";
import { setCdpSessionTokens } from "@/lib/cdp";
import { CdpTenantChoiceRequiredError } from "@/lib/cdp-auth-client";
import {
  // authenticateWithGoogle,
  authenticateWithPassword,
  readNativeLoginContext,
  redirectToNativeApp,
  validateNativeLoginContext,
} from "@/lib/platform-auth";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-[42px] w-full rounded-lg border border-neutral-200 bg-white px-3 text-[14px] font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-300 focus:border-neutral-400 dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-muted-foreground";
const PENDING_TENANT_CHOICE_KEY = "cluega:pending-tenant-choice";

function clearPendingTenantChoice() {
  try {
    sessionStorage.removeItem(PENDING_TENANT_CHOICE_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

// Kept for the "coming soon" social buttons below — re-enable with them.
// const socialButtonClassName =
//   "relative flex h-[44px] w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 text-[14px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted";

export function LoginForm({
  organizationPickerOnly = false,
}: {
  organizationPickerOnly?: boolean;
}) {
  const { t } = useTranslate();
  const contactSalesHref = useHelpHref("/contact-sales");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  // Non-null once mid-platform has said the address holds more than one
  // membership. Nobody is signed in while this is set: there is no token yet.
  const [tenantChoices, setTenantChoices] = useState<
    { tenantId: string; tenantName: string }[] | null
  >(null);
  const [isRestoringTenantChoice, setIsRestoringTenantChoice] = useState(true);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PENDING_TENANT_CHOICE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          email?: unknown;
          memberships?: unknown;
        };
        const memberships = parsed.memberships;
        if (
          typeof parsed.email === "string" &&
          Array.isArray(memberships) &&
          memberships.every(
            (choice) =>
              choice &&
              typeof choice.tenantId === "string" &&
              typeof choice.tenantName === "string",
          )
        ) {
          // sessionStorage is external state; restore it before showing the login form.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setEmail(parsed.email);
          setTenantChoices(memberships);
        } else {
          clearPendingTenantChoice();
        }
      }
    } catch {
      clearPendingTenantChoice();
    } finally {
      setIsRestoringTenantChoice(false);
    }
  }, []);

  const isCaptchaEnabled = isTurnstileEnabled();

  const handleCaptchaChange = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  // Turnstile tokens are single-use: every failed attempt needs a fresh one.
  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaResetSignal((signal) => signal + 1);
  }, []);

  const context = useMemo(
    () => readNativeLoginContext(searchParams),
    [searchParams],
  );
  const requestedReturn = useMemo(
    () => getSafeAppReturnPath(searchParams.get("from")),
    [searchParams],
  );
  const isWebMode = !context.nonce && context.from === null;
  // A direct /login (no ?from=) opened in a browser is still a web app login —
  // treat it as such and default the post-login destination to /flow. Native
  // logins carry a nonce/from context, so they keep their own redirect path.
  const isAppLogin = requestedReturn !== null || isWebMode;
  const appReturnPath = requestedReturn ?? APP_HOME_PATH;

  useEffect(() => {
    if (isRestoringTenantChoice) return;

    const query = searchParams.toString();
    if (organizationPickerOnly && !tenantChoices) {
      router.replace(query ? `/login?${query}` : "/login");
    } else if (!organizationPickerOnly && isAppLogin && tenantChoices) {
      router.replace(query ? `/select-org?${query}` : "/select-org");
    }
  }, [isAppLogin, isRestoringTenantChoice, organizationPickerOnly, router, searchParams, tenantChoices]);

  const contextErrorKey = useMemo(() => {
    if (isAppLogin) {
      return null;
    }

    const error = validateNativeLoginContext(context);
    if (error === "missingNonce" || error === "unsupportedPlatform") {
      return null;
    }
    return error;
  }, [context, isAppLogin]);

  const errorMessage = useMemo(() => {
    const key = errorKey ?? contextErrorKey;
    if (!key) {
      return null;
    }
    return t(`login.errors.${key}`);
  }, [contextErrorKey, errorKey, t]);

  const canSubmit =
    (isAppLogin || (Boolean(context.nonce) && context.from !== null)) &&
    !contextErrorKey &&
    !isSubmitting;

  // The captcha only gates the submit button — the fields stay usable while the
  // visitor is still solving it.
  const canSignIn = canSubmit && (!isCaptchaEnabled || Boolean(captchaToken));

  const completeSignIn = (account: {
    email: string;
    displayName: string;
    token: string;
    refreshToken: string;
  }) => {
    setIsSubmitting(true);
    if (context.nonce && context.from) {
      redirectToNativeApp({
        platform: context.from,
        nonce: context.nonce,
        email: account.email,
        displayName: account.displayName,
        token: account.token,
        refreshToken: account.refreshToken,
      });
    } else {
      router.push(APP_HOME_PATH);
    }
  };

  // COMING SOON SIGN-IN — restore with the Google button below.
  // const handleGoogleSignIn = () => {
  //   setErrorKey(null);
  //   if (isAppLogin) {
  //     setErrorKey("googleNotSupported");
  //     return;
  //   }
  //
  //   const validationError = validateNativeLoginContext(context);
  //   if (validationError) {
  //     setErrorKey(validationError);
  //     return;
  //   }
  //
  //   setIsSubmitting(true);
  //   try {
  //     completeSignIn(authenticateWithGoogle());
  //   } catch {
  //     setErrorKey("googleNotSupported");
  //     setIsSubmitting(false);
  //   }
  // };

  // The app-zone login POST, shared by the first attempt and by the retry that
  // carries the chosen organization.
  const submitAppLogin = async (tenantId?: string) => {
      const response = await fetch("/api/app-auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(tenantId ? {} : { email, password }),
          turnstileToken: captchaToken,
          ...(tenantId ? { tenantId } : {}),
        }),
      });

      if (!response.ok) {
        const failure = (await response.json().catch(() => undefined)) as
          | { error?: string }
          | undefined;
        if (tenantId && (response.status === 401 || response.status === 409)) {
          clearPendingTenantChoice();
          setTenantChoices(null);
          setPassword("");
          setErrorKey("organizationChallengeExpired");
          setIsSubmitting(false);
          const query = searchParams.toString();
          router.replace(query ? `/login?${query}` : "/login");
          return;
        }
        setErrorKey(
          failure?.error === "captchaFailed"
            ? "captchaFailed"
            : response.status === 401
              ? "invalidCredentials"
              : "loginFailed",
        );
        setIsSubmitting(false);
        resetCaptcha();
        return;
      }

      const data = (await response.json().catch(() => undefined)) as
        | {
          token?: string;
          refreshToken?: string;
          email?: string;
          displayName?: string;
          next?: string;
          memberships?: { tenantId: string; tenantName: string }[];
        }
        | undefined;

      // A picker is a 200 that carries no token. The redirect below is
      // unconditional, so without this the person lands in the app with no
      // session and no cookie -- signed out, with nothing explaining why.
      if (data?.next === "select_tenant") {
        const memberships = data.memberships ?? [];
        let choiceWasPersisted = false;
        try {
          sessionStorage.setItem(
            PENDING_TENANT_CHOICE_KEY,
            JSON.stringify({ email, memberships }),
          );
          choiceWasPersisted = true;
        } catch {
          // Keep the picker on this page if it cannot survive route navigation.
        }
        setIsSubmitting(false);
        resetCaptcha();
        if (isAppLogin && choiceWasPersisted) {
          const query = searchParams.toString();
          router.push(
            `/select-org${query ? `?${query}` : ""}`,
          );
          return;
        }
        setTenantChoices(memberships);
        return;
      }
      // Anything else without a token is a response we do not understand,
      // and navigating on it lands the person in the app signed out.
      if (!data?.token) {
        setErrorKey("loginFailed");
        setIsSubmitting(false);
        resetCaptcha();
        return;
      }

      clearPendingTenantChoice();

      // setCdpSessionTokens is the single token writer (lib/cdp/session.ts).
      setCdpSessionTokens({
        accessToken: data.token,
        refreshToken: data.refreshToken,
      });
      if (data.email) localStorage.setItem("cdp_email", data.email);
      if (data.displayName) {
        localStorage.setItem("cdp_display_name", data.displayName);
      }

      // Cross-zone navigation (landing → app zone) MUST be a hard load:
      // Next.js multi-zone does not support soft router transitions between
      // zones, so router.replace() to the app zone never completes and the
      // form hangs on "Signing in…". A full navigation lands on the app under
      // the same origin, with the session token already written above.
      window.location.assign(appReturnPath);
  };

  // Sending the choice back. The app zone goes through /api/app-auth so the
  // httpOnly cookie is set server-side; the native flow talks to CDP directly.
  const handleTenantChosen = async (tenantId: string) => {
    try {
      if (isAppLogin) {
        await submitAppLogin(tenantId);
        return;
      }
      const account = await authenticateWithPassword(email, password, tenantId);
      completeSignIn(account);
    } catch (error) {
      setIsSubmitting(false);
      if (error instanceof Error && error.message === "invalidCredentials") {
        setErrorKey("invalidCredentials");
        return;
      }
      setErrorKey("loginFailed");
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);

    if (isCaptchaEnabled && !captchaToken) {
      setErrorKey("captchaRequired");
      return;
    }

    if (!isAppLogin) {
      const validationError = validateNativeLoginContext(context);
      if (validationError) {
        setErrorKey(validationError);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isAppLogin) {
        await submitAppLogin();
        return;
      }

      // The native flow authenticates against CDP from the client, so the
      // captcha is verified on its own endpoint before the credentials go out.
      if (isCaptchaEnabled) {
        const captchaResponse = await fetch("/api/turnstile", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: captchaToken }),
        });

        if (!captchaResponse.ok) {
          setErrorKey("captchaFailed");
          setIsSubmitting(false);
          resetCaptcha();
          return;
        }
      }

      const account = await authenticateWithPassword(email, password);
      completeSignIn(account);
    } catch (error) {
      setIsSubmitting(false);
      resetCaptcha();
      // The native flow talks to CDP directly, so the picker reaches it as a
      // thrown value rather than as a 200 body.
      if (error instanceof CdpTenantChoiceRequiredError) {
        setTenantChoices(error.memberships);
        return;
      }
      if (error instanceof Error && error.message === "invalidCredentials") {
        setErrorKey("invalidCredentials");
        return;
      }
      setErrorKey("loginFailed");
    }
  };

  // The organization picker replaces the credential form entirely: the password
  // has already been accepted, and showing both would invite a second sign-in
  // attempt that is no longer the question being asked.
  if (isRestoringTenantChoice) {
    return <LoginPageFallback />;
  }

  if (
    (organizationPickerOnly && !tenantChoices) ||
    (!organizationPickerOnly && isAppLogin && tenantChoices)
  ) {
    return <LoginPageFallback />;
  }

  if (tenantChoices) {
    return (
      <Card className="relative z-10 w-full max-w-[440px] gap-0 overflow-hidden rounded-xl border-border bg-card p-0 shadow-sm">
        <CardHeader className="gap-0 border-b border-border p-6">
          <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Building2 aria-hidden="true" className="size-6" strokeWidth={1.75} />
          </div>
          <h1 className="text-[22px] font-semibold leading-tight text-foreground">
            {t("login.chooseOrganization")}
          </h1>
          <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
            {t("login.chooseOrganizationHint")}
          </p>
          <div className="mt-4 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
            <Mail aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6">
          {errorKey ? (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {t(`login.errors.${errorKey}`)}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {tenantChoices.map((choice) => (
              <Button
              className="group h-auto min-h-[68px] w-full justify-start gap-3 whitespace-normal rounded-lg border-border bg-card px-3 py-3 text-left shadow-none hover:border-foreground/20 hover:bg-muted/60 focus-visible:ring-ring/30"
                disabled={isSubmitting}
                key={choice.tenantId}
                onClick={() => {
                  setErrorKey(null);
                  setIsSubmitting(true);
                  void handleTenantChosen(choice.tenantId);
                }}
                type="button"
                variant="outline"
              >
                <Avatar aria-hidden="true" className="size-9 rounded-md">
                  <AvatarFallback
                    className="rounded-md bg-none text-muted-foreground"
                  >
                    <Building2 aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
                    {choice.tenantName || choice.tenantId}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-normal leading-4 text-muted-foreground">
                    {t("login.continue")}
                  </span>
                </span>
                <span className="text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true">
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            ))}
          </div>
        </CardContent>

        <Separator />
        <CardFooter className="p-3">
          <Button
            className="min-h-11 w-full whitespace-normal rounded-lg text-[13px]"
            disabled={isSubmitting}
            onClick={() => {
              clearPendingTenantChoice();
              setTenantChoices(null);
              setErrorKey(null);
              setPassword("");
            }}
            type="button"
            variant="quiet"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("login.chooseOrganizationBack")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="relative z-10 flex w-full max-w-[320px] flex-col">
      <h1 className="mb-6 text-center text-[22px] font-semibold text-neutral-900 dark:text-foreground">
        {t("login.welcomeBack")}
      </h1>

      {/* COMING SOON SIGN-IN — Google / Apple / SSO are hidden until the release
          that enables them. Uncomment this block (plus the imports,
          `socialButtonClassName` and `handleGoogleSignIn` above) to bring back. */}
      {/* <div className="mb-6 flex flex-col gap-2.5">
        <div className="relative">
          <button
            className={socialButtonClassName}
            disabled
            onClick={handleGoogleSignIn}
            type="button"
          >
            <GoogleIcon className="size-[18px]" />
            <span className="flex-1 text-center">{t("login.google")}</span>
            <span aria-hidden="true" className="w-[18px] shrink-0" />
          </button>
          <ComingSoonBadge />
        </div>

        <div className="relative">
          <button className={socialButtonClassName} disabled type="button">
            <AppleIcon />
            <span className="flex-1 text-center">{t("login.apple")}</span>
            <span aria-hidden="true" className="w-[18px] shrink-0" />
          </button>
          <ComingSoonBadge />
        </div>

        <div className="relative">
          <button className={socialButtonClassName} disabled type="button">
            <span aria-hidden="true" className="w-[18px] shrink-0" />
            <span className="flex-1 text-center">{t("login.sso")}</span>
            <span aria-hidden="true" className="w-[18px] shrink-0" />
          </button>
          <ComingSoonBadge />
        </div>
      </div> */}

      <form className="flex flex-col gap-4" onSubmit={handlePasswordSubmit}>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-neutral-700 dark:text-muted-foreground" htmlFor="login-email">
            {t("login.emailLabel")}
          </label>
          <input
            autoComplete="username"
            className={inputClassName}
            disabled={!canSubmit}
            id="login-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("login.emailPlaceholder")}
            type="email"
            value={email}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-semibold text-neutral-700 dark:text-muted-foreground" htmlFor="login-password">
              {t("login.passwordLabel")}
            </label>
            {/* Disabled since it shipped: there is no forgot-password screen, and
                the CDP gateway does not proxy the mid-platform's
                POST /v1/auth/forgot-password, so nothing here has a destination.
                It stays visible rather than hidden — a user who cannot sign in
                looks for this exact control, and its absence reads as "this
                product has no recovery" rather than "not yet". But the hover
                colour promised a link, so that goes, and the reason is stated
                where the cursor and the screen reader both find it. */}
            <div className="relative inline-flex">
              <button
                aria-label={`${t("login.forgotPassword")} — ${t("login.forgotPasswordUnavailable")}`}
                className="cursor-not-allowed text-[12px] font-semibold text-neutral-400 opacity-60 dark:text-muted-foreground"
                disabled
                title={t("login.forgotPasswordUnavailable")}
                type="button"
              >
                {t("login.forgotPassword")}
              </button>
            </div>
          </div>
          <div className="relative">
            <input
              autoComplete="current-password"
              className={cn(inputClassName, "pr-10")}
              disabled={!canSubmit}
              id="login-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("login.passwordPlaceholder")}
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600 dark:text-muted-foreground dark:hover:text-foreground"
              disabled={!canSubmit}
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? (
                <EyeOff className="size-4" strokeWidth={1.75} />
              ) : (
                <Eye className="size-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>

        {isCaptchaEnabled ? (
          <TurnstileWidget
            onTokenChange={handleCaptchaChange}
            resetSignal={captchaResetSignal}
          />
        ) : null}

        {errorMessage ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <button
          className={cn(
            "mt-1 h-[44px] w-full rounded-lg text-[14px] font-semibold text-white transition-colors",
            canSignIn
              ? "bg-neutral-400 hover:bg-black dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-black"
              : "cursor-not-allowed bg-neutral-400 opacity-70 dark:bg-neutral-700 dark:text-neutral-300",
          )}
          disabled={!canSignIn}
          type="submit"
        >
          {isSubmitting
            ? t(isWebMode ? "login.signingInWeb" : "login.signingIn")
            : t("login.signIn")}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px] font-semibold text-neutral-500 dark:text-muted-foreground">
        {t("login.registerPrompt")}{" "}
        {/* Self-serve sign-up does not exist yet — new accounts come through
            sales, so this points at the localized /contact-sales page. That page
            lives on the LANDING zone (cluega.com); this form renders on the app
            zone (cluega.ai), where a site-relative /contact-sales does not exist
            and bounced to /login?from=/flow. useHelpHref localizes, then crosses
            zones, and stays SSR-safe. */}
        <a
          className="font-semibold text-neutral-900 underline-offset-2 transition-colors hover:underline dark:text-foreground"
          href={contactSalesHref}
        >
          {t("login.register")}
        </a>
      </p>
    </div>
  );
}
