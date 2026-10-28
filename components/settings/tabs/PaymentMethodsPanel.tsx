"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  brandLabel,
  formatExpiry,
  isExpired,
  payableMethods,
} from "@/lib/billing/card-display";
import {
  isCardPaymentUnavailable,
  PaymentMethodError,
  readTenantPaymentMethods,
  removePaymentMethod,
  setDefaultPaymentMethod,
  startPaymentMethodSetup,
  type PlatformPaymentMethod,
} from "@/lib/billing/payment-methods";

/**
 * The cards this account can be charged on.
 *
 * The Inbox Manager app has had this screen since the card work landed; here
 * there was nothing, so a customer who only bought Cluega AI could not replace
 * an expiring card at all -- the next renewal simply failed and the first they
 * heard of it was a dunning notice.
 *
 * # NOTHING HERE TOUCHES A CARD NUMBER
 *
 * Adding one leaves for Stripe's own hosted page and the row appears when Stripe
 * reports the attachment through a webhook. Make default and Remove go to Stripe
 * first and show only what Stripe accepted, so the screen cannot claim a change
 * that did not happen at the provider.
 */

type Translate = (key: string) => string;

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, value),
    template,
  );
}

/**
 * Core's refusal, in words the customer can act on.
 *
 * The last-card refusal is the one worth its own sentence: it is not a failure
 * but a rule, and "something went wrong" would send the customer to support for
 * an answer the screen already has.
 */
function actionErrorText(err: unknown, t: Translate): string {
  if (err instanceof PaymentMethodError) {
    if (err.code === "last_payment_method_on_active_subscription") {
      return t("settings.billing.cards.lastCardRefused");
    }
    if (err.message) return err.message;
  }
  return t("settings.billing.cards.actionFailed");
}

function CardRow({
  method,
  busy,
  t,
  onMakeDefault,
  onRemove,
}: Readonly<{
  method: PlatformPaymentMethod;
  busy: boolean;
  t: Translate;
  onMakeDefault: () => void;
  onRemove: () => void;
}>) {
  const brand = brandLabel(method.brand) ?? t("settings.billing.cards.unknownBrand");
  const expiry = formatExpiry(method.expiresMonth, method.expiresYear);
  const expired = isExpired(method, new Date());

  return (
    <div
      data-testid={`card-${method.id}`}
      className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 py-3 last:border-b-0 dark:border-neutral-900"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
          <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
          <span className="tabular-nums">
            {brand} •••• {method.last4 ?? "—"}
          </span>
          {method.isDefault ? (
            <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] font-normal text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
              {t("settings.billing.cards.default")}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
          {expiry ? fill(t("settings.billing.cards.expires"), { expiry }) : ""}
          {/*
            An expired card is the whole reason this screen exists: it still
            appears on the account, and nothing else on it says why the next
            charge will fail.
          */}
          {expired ? (
            <span className="ml-2 text-rose-600 dark:text-rose-400">
              {t("settings.billing.cards.expired")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {method.isDefault ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={onMakeDefault}
            data-testid={`card-default-${method.id}`}
            className="text-[12px] font-medium text-neutral-900 underline underline-offset-4 disabled:opacity-50 dark:text-neutral-100"
          >
            {t("settings.billing.cards.makeDefault")}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          data-testid={`card-remove-${method.id}`}
          className="text-[12px] font-medium text-neutral-500 underline underline-offset-4 disabled:opacity-50 dark:text-neutral-400"
        >
          {t("settings.billing.cards.remove")}
        </button>
      </div>
    </div>
  );
}

export function PaymentMethodsPanel({ t }: { t: Translate }) {
  const { tenant } = useCurrentUser();
  const tenantId = tenant?.id ?? null;

  const [methods, setMethods] = useState<PlatformPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * This deployment has no card processor at all.
   *
   * Core only says so when the button is pressed -- listing cards reads the
   * mirror in the database and answers fine without Stripe, and there is no
   * endpoint that reports the capability up front. So the first press is what
   * we learn from, and after it the button stops offering something that
   * cannot happen. Deliberately not an error: nothing the customer did went
   * wrong, and a red alert on an operator's missing key reads as their fault.
   */
  const [unavailable, setUnavailable] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PlatformPaymentMethod | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setFailed(false);
    try {
      setMethods(await readTenantPaymentMethods(tenantId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addCard = async () => {
    if (!tenantId) return;
    setError(null);
    setBusy(true);
    try {
      // Back to THIS panel, not to the app's front door: Core keeps the path
      // and allowlists the origin.
      const returnTo = `${window.location.origin}${window.location.pathname}?settings=billing`;
      window.location.href = await startPaymentMethodSetup(tenantId, returnTo);
    } catch (e) {
      if (isCardPaymentUnavailable(e)) setUnavailable(true);
      else setError(actionErrorText(e, t));
      setBusy(false);
    }
  };

  const makeDefault = async (method: PlatformPaymentMethod) => {
    if (!tenantId) return;
    setError(null);
    setBusy(true);
    try {
      await setDefaultPaymentMethod(tenantId, method.id);
      await load();
    } catch (e) {
      setError(actionErrorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoval = async () => {
    if (!tenantId || !pendingRemoval) return;
    setError(null);
    setBusy(true);
    try {
      await removePaymentMethod(tenantId, pendingRemoval.id);
      setPendingRemoval(null);
      await load();
    } catch (e) {
      // The dialog stays open with the reason on it: a refusal read behind a
      // closing dialog is a click that looks like it did nothing.
      setError(actionErrorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (!tenantId || (loading && methods.length === 0)) return null;

  const payable = payableMethods(methods);

  return (
    <div
      data-testid="payment-methods-panel"
      className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("settings.billing.cards.title")}
          </div>
          <div className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
            {t("settings.billing.cards.subtitle")}
          </div>
        </div>
        <button
          type="button"
          disabled={busy || unavailable}
          onClick={() => void addCard()}
          data-testid="card-add"
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {t("settings.billing.cards.add")}
        </button>
      </div>

      {/*
        Same muted voice as the empty state, not the alert below it: this is
        the screen telling the reader what it cannot offer, which is a fact
        about the deployment rather than a failure to report.
      */}
      {unavailable ? (
        <div
          data-testid="card-unavailable"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t("settings.billing.cards.unavailable")}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          data-testid="card-error"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
        >
          {error}
        </div>
      ) : null}

      {failed ? (
        <div
          data-testid="cards-failed"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t("settings.billing.cards.loadFailed")}
        </div>
      ) : payable.length === 0 ? (
        <div
          data-testid="cards-empty"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t("settings.billing.cards.none")}
        </div>
      ) : (
        <div className="mt-2 flex flex-col">
          {payable.map((method) => (
            <CardRow
              key={method.id}
              method={method}
              busy={busy}
              t={t}
              onMakeDefault={() => void makeDefault(method)}
              onRemove={() => setPendingRemoval(method)}
            />
          ))}
        </div>
      )}

      {pendingRemoval ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
              {t("settings.billing.cards.removeTitle")}
            </div>
            <div className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300">
              {fill(t("settings.billing.cards.removeConfirm"), {
                card: `${brandLabel(pendingRemoval.brand) ?? t("settings.billing.cards.unknownBrand")} •••• ${pendingRemoval.last4 ?? "—"}`,
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingRemoval(null);
                  setError(null);
                }}
                className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[12px] font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-200"
              >
                {t("settings.billing.cards.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmRemoval()}
                data-testid="card-remove-confirm"
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {t("settings.billing.cards.remove")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
