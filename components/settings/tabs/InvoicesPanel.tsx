"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { APP_MODULES } from "@/lib/billing/subscription-selection";
import {
  canAskForRefund,
  invoiceRefundState,
  invoiceTotalUsd,
  refundOutcomeAmount,
  type InvoiceRefundState,
} from "@/lib/billing/invoice-refund";
import {
  InvoiceRefundError,
  readTenantInvoices,
  requestInvoiceRefund,
  type InvoiceRefundOutcome,
  type PlatformInvoice,
} from "@/lib/billing/platform-subscriptions";

/**
 * The tenant's invoices, newest first.
 *
 * For a Stripe-managed subscription these are the invoices STRIPE issued — the
 * monthly worker skips those tenants so a period is never billed twice, and the
 * webhook records what was actually charged. Nothing here re-derives an amount:
 * every figure is the one the customer's card was charged.
 *
 * Scoped to the products THIS app sells, through the same APP_MODULES list the
 * plan panel above it uses -- one answer to "what is this app about" rather than
 * two that can drift. A tenant has one billing account carrying every product's
 * invoices, so unscoped this tab showed an Inbox Manager charge under Cluega AI
 * billing. IM's own invoices are on IM's own billing screen, which says more
 * about them than this list could.
 *
 * An invoice that names no product at all is listed here anyway: Core returns
 * those for every module, because nothing lists unattributed invoices and
 * hiding money the customer paid is the worse mistake.
 *
 * The row links out to the provider's hosted invoice rather than re-rendering it.
 * That page is the authoritative document — it carries the line items, the tax
 * treatment and the receipt — and a second rendering of a financial document is a
 * second chance to disagree with it.
 */

type Translate = (key: string) => string;

const LIVE_STATUS_KEY: Record<string, string> = {
  paid: "statusPaid",
  open: "statusOpen",
  draft: "statusDraft",
  void: "statusVoid",
  uncollectible: "statusUncollectible",
};

/**
 * The status a customer should read, which is not always the provider's.
 *
 * Stripe keeps a refunded invoice as `paid` -- the payment did happen -- so a
 * row that says nothing else tells a customer they paid $200 for something they
 * were given their money back for. The refund and the chargeback are separate
 * words on purpose: one is us sending it back, the other is their bank taking
 * it.
 */
function statusKeyFor(invoice: PlatformInvoice, state: InvoiceRefundState): string {
  if (state === "charged_back") return "statusChargedBack";
  if (state === "full") return "statusRefunded";
  if (state === "partial") return "statusPartiallyRefunded";
  return LIVE_STATUS_KEY[invoice.status] ?? "statusOpen";
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, value),
    template,
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unexpected currency code must not blank the amount.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** The period an invoice covers, or its issue date when it names no period. */
function invoiceWhen(invoice: PlatformInvoice, t: Translate): string {
  const start = formatDate(invoice.periodStart);
  const end = formatDate(invoice.periodEnd);
  if (start && end) {
    return fill(t("settings.billing.invoices.period"), { start, end });
  }
  return formatDate(invoice.issuedAt) || formatDate(invoice.dueDate);
}

/**
 * The customer's own "ask for a refund", on one invoice.
 *
 * The rule lives in Core: inside a short window after paying, an invoice whose
 * period is barely used refunds itself; otherwise the ask becomes a request a
 * person answers. Nothing here computes any of that -- the button appears on an
 * invoice that still has money on it, and whatever Core answers is what the
 * customer is told. A screen that guessed the window would either promise a
 * refund the server refuses or hide one it would have given.
 *
 * Per invoice, not per panel: two rows must not share a reason box or an
 * answer.
 */
function InvoiceRefundAsk({
  tenantId,
  invoice,
  t,
  onDone,
}: Readonly<{
  tenantId: string;
  invoice: PlatformInvoice;
  t: Translate;
  onDone: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<InvoiceRefundOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const answer = await requestInvoiceRefund(tenantId, invoice.id, reason.trim());
      setOutcome(answer);
      setOpen(false);
      // The list is re-read because a refund Core took changes the row: the
      // amount refunded and the status both come from the invoice, not from
      // this answer.
      onDone();
    } catch (e) {
      setError(refusalText(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (outcome) {
    return (
      <div
        role="status"
        data-testid={`refund-outcome-${invoice.id}`}
        className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      >
        {outcome.status === "refunded"
          ? fill(t("settings.billing.invoices.refundDone"), {
              amount: refundOutcomeAmount(
                outcome.amountUsd,
                invoice.currency,
                formatMoney,
              ),
            })
          : t("settings.billing.invoices.refundPending")}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {error ? (
        <div
          role="alert"
          data-testid={`refund-error-${invoice.id}`}
          className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
        >
          {error}
        </div>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {t("settings.billing.invoices.refundReasonPrompt")}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={280}
            placeholder={t("settings.billing.invoices.refundReasonPlaceholder")}
            data-testid={`refund-reason-${invoice.id}`}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => void submit()}
              data-testid={`refund-submit-${invoice.id}`}
              className="rounded-xl bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {busy
                ? t("settings.billing.invoices.refundSending")
                : t("settings.billing.invoices.refundSubmit")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setReason("");
              }}
              className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[12px] font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-200"
            >
              {t("settings.billing.invoices.refundCancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`refund-ask-${invoice.id}`}
          className="text-[12px] font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {t("settings.billing.invoices.refundAsk")}
        </button>
      )}
    </div>
  );
}

/**
 * Core's refusal, in words the customer can act on.
 *
 * The two cases a customer can do something about get their own sentence; for
 * anything else Core's own message is shown, because Core writes these for
 * customers to read and a generic "something went wrong" would hide a reason
 * that was already plain.
 */
function refusalText(err: unknown, t: Translate): string {
  if (err instanceof InvoiceRefundError) {
    if (err.code === "refund_window_closed") {
      return t("settings.billing.invoices.refundWindowClosed");
    }
    if (err.code === "request_already_open") {
      return t("settings.billing.invoices.refundAlreadyAsked");
    }
    if (err.message) return err.message;
  }
  return t("settings.billing.invoices.refundFailed");
}

export function InvoicesPanel({ t }: { t: Translate }) {
  const { tenant } = useCurrentUser();
  const tenantId = tenant?.id ?? null;

  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumped after a refund Core took, to re-read the rows: what the invoice says
  // about the money is the invoice's answer, not the ask's.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    // Rows are NOT cleared here: see the first-load note below.
    void readTenantInvoices(tenantId, { modules: APP_MODULES })
      .then((rows) => {
        if (alive) setInvoices(rows);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tenantId, reload]);

  // Nothing at all on the FIRST load: a heading with an empty body reads as "you
  // have no invoices", which is a different and possibly wrong statement.
  //
  // A later re-read keeps the rows on screen. Blanking on every read cost a real
  // answer: a refund the customer had just been granted unmounted the row that
  // was telling them so, and they were left looking at the same button again --
  // measured in the browser on a real $200 refund.
  if (!tenantId || (loading && invoices.length === 0)) return null;

  return (
    <div
      data-testid="invoices-panel"
      className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="border-b border-dashed border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {t("settings.billing.invoices.title")}
        </div>
        <div className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
          {t("settings.billing.invoices.subtitle")}
        </div>
      </div>

      {failed ? (
        <div
          data-testid="invoices-failed"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t("settings.billing.invoices.loadFailed")}
        </div>
      ) : invoices.length === 0 ? (
        <div
          data-testid="invoices-empty"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t("settings.billing.invoices.none")}
        </div>
      ) : (
        <div className="mt-4 flex flex-col">
          {invoices.map((invoice) => {
            const refundState = invoiceRefundState(invoice);
            return (
            <div
              key={invoice.id}
              data-testid={`invoice-${invoice.id}`}
              className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 last:border-b-0 dark:border-neutral-900"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                  {invoiceWhen(invoice, t)}
                  {invoice.moduleCode ? (
                    <span className="ml-2 text-[12px] font-normal text-neutral-500 dark:text-neutral-400">
                      {invoice.moduleCode}
                    </span>
                  ) : null}
                </div>
                <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
                  {t(`settings.billing.invoices.${statusKeyFor(invoice, refundState)}`)}
                  {invoice.invoiceNo ? ` · ${invoice.invoiceNo}` : ""}
                </div>
                {/*
                  Only where there is money on the invoice that has not come
                  back yet. Core still owns the decision.
                */}
                {tenantId && canAskForRefund(invoice) ? (
                  <InvoiceRefundAsk
                    tenantId={tenantId}
                    invoice={invoice}
                    t={t}
                    onDone={() => setReload((n) => n + 1)}
                  />
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <div className="text-[13px] font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                  {formatMoney(invoiceTotalUsd(invoice), invoice.currency)}
                </div>
                {/*
                  Only when the provider gave us a page. A row with no link shows
                  no button, rather than a button that goes nowhere.
                */}
                {invoice.hostedInvoiceUrl ? (
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`invoice-link-${invoice.id}`}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-900 underline underline-offset-4 dark:text-neutral-100"
                  >
                    {t("settings.billing.invoices.view")}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
