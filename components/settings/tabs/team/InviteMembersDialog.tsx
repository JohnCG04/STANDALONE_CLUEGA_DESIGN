"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Mail, Plus, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { getCompanyRoles, TeamApiError, type CompanyRole } from "@/lib/teams/cdp-teams";
import { inviteTeamMembers, type InviteResult } from "@/lib/teams/cdp-team-directory";
import {
  companyRoleDescription,
  companyRoleKind,
  companyRoleLabel,
} from "@/lib/teams/company-role-label";
import { teamErrorMessage } from "@/lib/teams/team-error.lib";
import { cn } from "@/lib/utils";

/**
 * Settings › Team › "Quản lý chi tiết" — invite people who have no account yet.
 *
 * The roster has always been able to accept, resend or cancel an invitation.
 * Until this existed it could not SEND one: every invitation in CDP had to be
 * created from the IM app, so the pending rows here came from a screen the
 * administrator looking at them could not reach.
 *
 * Addresses become chips before they are sent. Typing straight into a textarea
 * and splitting on submit would be fewer parts, but it hides the batch until it
 * is too late to fix — a chip is a thing you can see and remove, and a batch of
 * eight is exactly when a typo is easiest to miss.
 */

const dialogCard =
  "w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950";

/**
 * The three outcomes upstream answers with. Anything else prints itself.
 *
 * The same rule the status column next door follows: a value this client has
 * not been taught shows up as unfamiliar rather than being folded into the
 * nearest friendly label — and, without the guard, `t()` on a missing key would
 * render the key itself, which is worse than either.
 */
const INVITE_STATUSES = new Set(["invited", "skipped", "error"]);

/**
 * Structural check only, and deliberately the same shape the backend accepts.
 *
 * It exists to keep the "+" button honest, not to be the gate: the address is
 * validated again server-side, where a batch that would otherwise come back as
 * HTTP 200 with a buried per-row error is refused with a 400 instead.
 */
function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return false;
  const domain = trimmed.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * Splits one typed value into candidate addresses.
 *
 * Pasting a column out of a spreadsheet is how a real onboarding round starts,
 * and it arrives separated by commas, semicolons, newlines or tabs depending on
 * where it came from. Accepting one separator would mean the other three paste
 * as a single unusable chip.
 */
function splitAddresses(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

interface InviteMembersDialogProps {
  onClose: () => void;
  /** Called after a batch that invited at least one person, so the roster reloads. */
  onInvited: () => void;
}

export function InviteMembersDialog({ onClose, onInvited }: InviteMembersDialogProps) {
  const { t } = useTranslate();

  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [roles, setRoles] = useState<CompanyRole[] | null>(null);
  const [roleId, setRoleId] = useState("");
  const [rolesForbidden, setRolesForbidden] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getCompanyRoles();
        if (cancelled) return;
        setRoles(list);
        // Default to the least-privileged role that exists rather than the first
        // one returned: an invitation that silently grants admin because that
        // row sorted first is the kind of default nobody reviews.
        // By kind, not by bare slug: a tenant's own copy of the system role is
        // slugged `ovr-<tenant>-viewer`, which a `slug === "viewer"` test missed.
        const viewer = list.find((r) => companyRoleKind(r) === "viewer");
        const operator = list.find((r) => companyRoleKind(r) === "operator");
        setRoleId((viewer ?? operator ?? list[0])?.id ?? "");
      } catch (err) {
        if (cancelled) return;
        // Reading company roles is administrators-only. Someone who cannot read
        // them cannot invite either, so this is the same 403 the send would hit
        // — surfaced now rather than after they have typed eight addresses.
        if (err instanceof TeamApiError && err.status === 403) setRolesForbidden(true);
        setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addDraft = useCallback(() => {
    const parts = splitAddresses(draft);
    if (parts.length === 0) return;
    const invalid = parts.find((p) => !looksLikeEmail(p));
    if (invalid) {
      setError(t("settings.team.inviteInvalidEmail").replace("{email}", invalid));
      return;
    }
    setError(null);
    setEmails((prev) => {
      const seen = new Set(prev.map((e) => e.toLowerCase()));
      const next = [...prev];
      for (const part of parts) {
        const lowered = part.toLowerCase();
        if (!seen.has(lowered)) {
          seen.add(lowered);
          next.push(lowered);
        }
      }
      return next;
    });
    setDraft("");
  }, [draft, t]);

  const removeEmail = useCallback((email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  // What would be sent if Send were pressed right now — the chips plus anything
  // still sitting in the input. Without this, typing one address and pressing
  // Send does nothing, which reads as a broken button rather than a forgotten
  // "+".
  const pending = useMemo(() => {
    const parts = splitAddresses(draft).filter(looksLikeEmail);
    const seen = new Set(emails.map((e) => e.toLowerCase()));
    return [...emails, ...parts.map((p) => p.toLowerCase()).filter((p) => !seen.has(p))];
  }, [emails, draft]);

  const handleSend = useCallback(async () => {
    if (pending.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const rows = await inviteTeamMembers(pending, roleId || undefined);
      setResults(rows);
      setEmails([]);
      setDraft("");
      // Partial success is the normal case: one address already in the tenant
      // comes back "skipped" beside others that were invited. The roster is
      // reloaded when anything landed, and the per-row outcome stays on screen.
      if (rows.some((r) => r.status === "invited")) onInvited();
    } catch (err) {
      // The shared mapper, not the raw message: a gateway failure arrived as
      // "Request failed: 502" in every language.
      setError(err instanceof Error ? teamErrorMessage(t, err) : t("settings.team.inviteError"));
    } finally {
      setSending(false);
    }
  }, [pending, roleId, onInvited, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.team.inviteTitle")}
    >
      <div className={dialogCard}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
              {t("settings.team.inviteTitle")}
            </div>
            <div className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
              {t("settings.team.inviteSubtitle")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("settings.team.inviteClose")}
            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900"
          >
            <X className="size-4" />
          </button>
        </div>

        {rolesForbidden ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {t("settings.team.inviteForbidden")}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Addresses */}
        <div className="mt-4">
          <label
            htmlFor="invite-email"
            className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-700 dark:text-neutral-300"
          >
            <Mail className="size-3.5 text-neutral-400" />
            {t("settings.team.inviteEmailLabel")}
          </label>

          {emails.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {emails.map((email) => (
                <li
                  key={email}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 py-1 pl-2.5 pr-1 text-[12px] text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  <span className="min-w-0 truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    aria-label={`${t("settings.team.inviteRemoveEmail")}: ${email}`}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-2 flex gap-2">
            <input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={draft}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter and comma both commit, because both are how people end
                // an address when typing a list.
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder={t("settings.team.inviteEmailPlaceholder")}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-[12px]"
              disabled={sending || splitAddresses(draft).length === 0}
              onClick={addDraft}
            >
              <Plus className="size-3.5" />
              {t("settings.team.inviteAdd")}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("settings.team.inviteEmailHint")}
          </p>
        </div>

        {/* Role — a list with a sentence under each name, not a bare <select>.
            The select showed the stored English names ("CDP Administrator…")
            with nothing to tell the three apart, so the one decision this
            dialog exists for was made blind. */}
        {roles && roles.length > 0 ? (
          <div className="mt-4">
            <div
              id="invite-role-label"
              className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300"
            >
              {t("settings.team.inviteRoleLabel")}
            </div>
            <div
              role="radiogroup"
              aria-labelledby="invite-role-label"
              className="mt-2 flex flex-col gap-1.5"
            >
              {roles.map((r) => {
                const selected = r.id === roleId;
                const description = companyRoleDescription(r, t);
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={sending}
                    onClick={() => setRoleId(r.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900"
                        : "border-border hover:bg-neutral-50 dark:hover:bg-neutral-900",
                      sending && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-neutral-900 dark:border-neutral-100"
                          : "border-neutral-300 dark:border-neutral-600",
                      )}
                    >
                      {selected ? (
                        <span className="size-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                        {companyRoleLabel(r, t)}
                      </span>
                      {description ? (
                        <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
                          {description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Granting administration by invitation is the one choice here that
                cannot be taken back quietly: the invitee can manage members and
                everyone's data from their first sign-in. */}
            {companyRoleKind(roles.find((r) => r.id === roleId) ?? {}) === "admin" ? (
              <div
                role="note"
                className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("settings.team.inviteAdminWarning")}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Per-address outcome. A batch is partially successful by design, so the
            rows are what the administrator reads — not the HTTP status. */}
        {results && results.length > 0 ? (
          <ul className="mt-4 flex max-h-[30vh] flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
            {results.map((r) => (
              <li key={r.email} className="flex items-start gap-2 px-1 py-1 text-[12px]">
                {r.status === "invited" ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      r.status === "skipped" ? "text-amber-500" : "text-red-500",
                    )}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{r.email}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    r.status === "invited"
                      ? "text-emerald-600"
                      : r.status === "skipped"
                        ? "text-amber-600"
                        : "text-red-600",
                  )}
                  title={r.message || undefined}
                >
                  {INVITE_STATUSES.has(r.status)
                    ? t(`settings.team.inviteStatus.${r.status}`)
                    : r.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={sending}>
            {results ? t("settings.team.inviteDone") : t("settings.team.inviteCancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="gap-1.5"
            disabled={sending || pending.length === 0 || rolesForbidden}
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {pending.length > 1
              ? t("settings.team.inviteSendMany").replace("{count}", String(pending.length))
              : t("settings.team.inviteSend")}
          </Button>
        </div>
      </div>
    </div>
  );
}
