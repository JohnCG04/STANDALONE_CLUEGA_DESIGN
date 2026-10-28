"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Search,
  Trash2,
  UserCog,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";
import { useCanInviteMembers } from "@/hooks/useCanInviteMembers";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTeamDirectory } from "@/hooks/useTeamDirectory";
import { TeamApiError } from "@/lib/teams/cdp-teams";
import {
  DIRECTORY_STATUS_LABEL_KEY,
  DIRECTORY_STATUS_TONE,
  createDepartment,
  listAllTeamDirectory,
  listDepartments,
  listTeamDirectory,
  removeTenantMember,
  runInvitationAction,
  type DirectoryDepartment,
  type DirectoryMember,
  type DirectorySortKey,
  type InvitationAction,
} from "@/lib/teams/cdp-team-directory";
import { companyRoleLabel } from "@/lib/teams/company-role-label";
import { teamErrorMessage } from "@/lib/teams/team-error.lib";
import { cn } from "@/lib/utils";

import { avatarColor, avatarInitial } from "../../avatarIdentity";
import { useSettings } from "../../context";
import { requestAccessSubTab } from "../accessSubTabRequest";
import { InviteMembersDialog } from "./InviteMembersDialog";
import { DirectoryColumnsMenu, useDirectoryColumns, type DirectoryColumnId } from "./DirectoryColumnsMenu";

/**
 * Settings › Team › "Quản lý chi tiết" — the paged, searchable tenant roster.
 *
 * Sits beside the existing member list rather than replacing it. That list is
 * enough for a small team and people already know it; this one exists for the
 * tenants where scrolling a full roster stopped being practical.
 *
 * Search, sort and paging all happen on the server. The only thing computed here
 * is the CSV, and even that re-fetches rather than exporting what is on screen.
 */

/**
 * Which column maps to which sort key. A column outside this list gets no
 * control at all — no arrow, nothing to click.
 *
 * Every entry was verified against staging by asking for asc and desc and
 * checking the order changed. `email` earned its place that way after the first
 * version left it out; `department` is absent because the same check showed
 * mid-platform accepts it and then ignores it.
 */
const SORTABLE: Partial<Record<DirectoryColumnId, DirectorySortKey>> = {
  member: "name",
  email: "email",
  role: "role",
  status: "status",
  created: "created_at",
};

/**
 * Whether "+ Create department" is offered.
 *
 * Off: the button posts to /api/v1/departments, and CDP `dev` routes only the
 * GET (routes_identity.go). The POST lives on the unmerged
 * `feat/cdp-invite-teammates` branch, so every click failed. Turn this back on
 * when that route is on `dev` — the panel below is kept as it was.
 */
const DEPARTMENT_CREATE_AVAILABLE = false;

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const TONE_CLASS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  off: "bg-muted text-muted-foreground",
  unknown: "border border-border text-muted-foreground",
};

/**
 * What can be done to one row.
 *
 * Invited rows render exactly the verbs upstream said were available — an
 * expired invitation offers reinvite and cancel, and a row that cannot be
 * reinvited never shows the button. Deriving that list from `status` here would
 * be a second copy of a rule the backend already owns, and the two would drift.
 *
 * Active rows get removal only. Role is displayed but not editable from this
 * table: the value shown is a TENANT role, and the endpoint that changes roles
 * is team-scoped — wiring them together would appear to work and change
 * something else.
 */
function RowActions({
  member,
  t,
  busy,
  isSelf,
  onInvitation,
  onRemove,
  onChangeRole,
}: {
  member: DirectoryMember;
  t: (key: string) => string;
  busy: boolean;
  /** The signed-in user's own row: nothing here may remove them. */
  isSelf: boolean;
  onInvitation: (action: InvitationAction) => void;
  onRemove: () => void;
  /** Null when the caller cannot change company roles. */
  onChangeRole: (() => void) | null;
}) {
  const actions = member.availableActions;

  if (member.invitationId && actions.length > 0) {
    return (
      <div className="flex justify-end gap-1">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            onClick={() => onInvitation(action as InvitationAction)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[12px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              action === "cancel" || action === "reject"
                ? "text-muted-foreground hover:text-foreground"
                : "text-foreground hover:bg-muted",
              busy && "cursor-not-allowed opacity-50",
            )}
          >
            {t(`settings.team.dirAction_${action}`)}
          </button>
        ))}
      </div>
    );
  }

  if (!member.userId) return <span className="block text-right text-muted-foreground">—</span>;

  // An already-disabled account has nothing left to remove.
  //
  // Removal is a soft delete: upstream sets status to 'disabled' and treats a
  // row that is already disabled as no rows affected, which surfaces as
  // HTTP 404. So the button on such a row could only ever answer "Resource not
  // found" — an error message about a person plainly listed on screen, for an
  // action whose end state they are already in.
  if (member.status === "disabled") {
    return <span className="block text-right text-muted-foreground">—</span>;
  }

  return (
    <div className="flex justify-end gap-0.5">
      {/* The role is a COMPANY role, changed on Access & Permissions › Company
          roles; this takes the reader there rather than leaving the column as
          a value with no way to act on it. */}
      {onChangeRole && !isSelf ? (
        <button
          type="button"
          disabled={busy}
          onClick={onChangeRole}
          aria-label={t("settings.team.dirChangeRole")}
          title={t("settings.team.dirChangeRole")}
          className={cn(
            "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            busy && "cursor-not-allowed opacity-50",
          )}
        >
          <UserCog className="size-3.5" />
        </button>
      ) : null}
      {/* Never on your own row: removing yourself disables your account and
          revokes every session, and nothing in the product re-enables it. */}
      {isSelf ? null : (
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        aria-label={t("settings.team.dirRemove")}
        title={t("settings.team.dirRemove")}
        className={cn(
          "rounded p-1 text-muted-foreground transition-colors",
          "hover:bg-destructive/10 hover:text-destructive",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          busy && "cursor-not-allowed opacity-50",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
      )}
    </div>
  );
}

/**
 * The status cell.
 *
 * Reads the row's own value through a map instead of testing it against one
 * literal. The first version asked `status === "invited"`, which nothing
 * upstream ever answers, so every row fell through to "active" — including a
 * disabled account. Labelling a disabled account as working is the kind of
 * wrong answer somebody acts on.
 *
 * An unmapped value prints itself in a neutral outline rather than being folded
 * into the nearest friendly label, so a status this client has not been taught
 * shows up as unfamiliar instead of quietly reading as fine.
 */
function StatusPill({ status, t }: { status: string; t: (key: string) => string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const tone = DIRECTORY_STATUS_TONE[status] ?? "unknown";
  const labelKey = DIRECTORY_STATUS_LABEL_KEY[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLASS[tone],
      )}
      title={status}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {labelKey ? t(labelKey) : status}
    </span>
  );
}

function DirectoryFilterCombobox({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 190 });
  const selected = options.find((option) => option.value === value) ?? options[0];

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ left: rect.left, top: rect.bottom + 8, width: Math.max(rect.width, 190) });
  };

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-[150px]">
      <button
        type="button"
        role="combobox"
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          updateMenuPosition();
          setOpen((current) => !current);
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 text-[13px] shadow-sm transition-colors",
          "hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value ? "border-foreground/40 font-medium" : "border-border",
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label={ariaLabel}
              style={{ left: menuPosition.left, top: menuPosition.top, width: menuPosition.width }}
              className="fixed z-[100] rounded-xl border border-border bg-popover p-1.5 shadow-xl"
            >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                  "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-muted font-semibold",
                )}
              >
                {option.label}
                {active ? <Check className="size-3.5 text-primary" /> : null}
              </button>
            );
          })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Confirms an action that cannot be quietly undone: removing someone, or
 * cancelling an invitation.
 *
 * The app's own dialog, in its own colours. It used to be a dark imitation of
 * the browser's alert, titled with the staging hostname ("dev.cluega.ai
 * says") and confirmed with "OK".
 */
function ConfirmDialog({
  request,
  onClose,
  t,
}: {
  request: { title: string; body: string; confirmLabel: string; onConfirm: () => void } | null;
  onClose: () => void;
  t: (key: string) => string;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(420px,calc(100vw-2rem))] p-6">
        <DialogTitle>{request?.title ?? ""}</DialogTitle>
        <DialogDescription className="mt-1">{request?.body ?? ""}</DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("settings.team.removeDialogCancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              const confirm = request?.onConfirm;
              onClose();
              confirm?.();
            }}
          >
            {request?.confirmLabel ?? ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateDepartmentPanel({
  open,
  onClose,
  onCreated,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (department: DirectoryDepartment) => void;
  t: (key: string) => string;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };

  const requestClose = () => {
    if (!saving) close();
  };

  const save = async () => {
    const value = name.trim();
    if (!value) {
      setError(t("settings.team.departmentNameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onCreated(await createDepartment(value));
      close();
    } catch (err) {
      setError(err instanceof Error ? teamErrorMessage(t, err) : t("settings.team.departmentCreateError"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("settings.team.departmentCreateTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.team.departmentCreateDescription")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("settings.team.removeDialogCancel")}
          onClick={requestClose}
          disabled={saving}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {error ? <div className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="department-name">
          {t("settings.team.departmentNameLabel")}
          <input
            id="department-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void save()}
            placeholder={t("settings.team.departmentNamePlaceholder")}
            disabled={saving}
            className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={saving}>
            {t("settings.team.removeDialogCancel")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("settings.team.departmentCreateButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TeamDirectoryPanel() {
  const { t } = useTranslate();
  const dir = useTeamDirectory();
  const invitePermission = useCanInviteMembers();
  const me = useCurrentUser();
  const { setActiveTab } = useSettings();
  const myEmail = me.email.trim().toLowerCase();
  const { columns, toggleColumn, isVisible } = useDirectoryColumns();
  const [exporting, setExporting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  /** Which row has a call in flight — disables only that row's buttons. */
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DirectoryDepartment[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // Removing somebody disables them upstream rather than deleting the row, so a removed person
  // would sit in the list for ever as "Disabled". They are hidden by default; this brings them
  // back for whoever needs to see who was removed.
  const [showDisabled, setShowDisabled] = useState(false);
  const disabledCount = dir.members.filter((m) => m.status === "disabled").length;
  const visibleMembers = showDisabled
    ? dir.members
    : dir.members.filter((m) => m.status !== "disabled");

  /**
   * Departments for the filter.
   *
   * Fetched once and failing silently: this endpoint answers 403 for a caller
   * without the department permission, and the right response to that is not to
   * offer the filter — not to show an error about a control they never asked
   * for. `departments` stays null and the dropdown does not render.
   */
  useEffect(() => {
    const controller = new AbortController();
    listDepartments(controller.signal)
      .then(setDepartments)
      .catch(() => setDepartments(null));
    return () => controller.abort();
  }, []);

  /**
   * Runs an invitation action, then reloads.
   *
   * The reload is the point: after "Mời lại" the row's status and its own
   * `available_actions` both change upstream, and re-deriving either here would
   * be a second copy of a rule the backend already owns.
   */
  const act = async (member: DirectoryMember, action: InvitationAction) => {
    if (!member.invitationId) return;
    setPendingRow(member.invitationId);
    setActionError(null);
    try {
      await runInvitationAction(member.invitationId, action);
      await dir.refresh();
    } catch (e) {
      setActionError(teamErrorMessage(t, e));
    } finally {
      setPendingRow(null);
    }
  };

  /**
   * Removes somebody from the workspace.
   *
   * Confirmed first, and the prompt names the person: this ends their access to
   * everything, not just one team, and it is a click away from buttons that only
   * resend an email.
   */
  const remove = async (member: DirectoryMember) => {
    setPendingRow(member.userId);
    setActionError(null);
    try {
      await removeTenantMember(member.userId);
      await dir.refresh();
    } catch (e) {
      // A 404 here does not mean the person is missing — the row is on screen.
      // Upstream's removal is an UPDATE that skips rows already disabled, and
      // no rows affected comes back as not-found. The button is hidden on
      // disabled rows, so reaching this means the row went stale: somebody else
      // disabled them while this list was open. Say that, and reload, rather
      // than passing "Resource not found" through to an administrator.
      if (e instanceof TeamApiError && e.status === 404) {
        setActionError(t("settings.team.dirRemoveAlreadyGone"));
        await dir.refresh();
      } else if (e instanceof TeamApiError && e.status === 409) {
        // Upstream's one 409 on this route is the tenant owner, who cannot be
        // removed. It arrived as its raw English sentence, and there is no
        // ownership transfer to point at yet.
        setActionError(t("settings.team.dirRemoveOwner"));
      } else {
        setActionError(teamErrorMessage(t, e));
      }
    } finally {
      setPendingRow(null);
    }
  };

  const askRemove = (member: DirectoryMember) =>
    setConfirmRequest({
      title: t("settings.team.removeDialogTitle"),
      body: t("settings.team.dirRemoveConfirm").replace("{name}", member.name || member.email),
      confirmLabel: t("settings.team.removeDialogConfirm"),
      onConfirm: () => void remove(member),
    });

  // Cancelling an invitation sends nothing and cannot be undone from here — the
  // only way back is a new invitation — so it is confirmed like a removal.
  // Resend and accept are not: they are the actions people come here to take.
  const askInvitation = (member: DirectoryMember, action: InvitationAction) => {
    if (action !== "cancel") {
      void act(member, action);
      return;
    }
    setConfirmRequest({
      title: t("settings.team.dirCancelInviteTitle"),
      body: t("settings.team.dirCancelInviteConfirm").replace("{email}", member.email || member.name),
      confirmLabel: t("settings.team.dirCancelInviteAction"),
      onConfirm: () => void act(member, action),
    });
  };

  const changeRole = invitePermission.canInvite
    ? () => {
        requestAccessSubTab("companyRoles");
        setActiveTab("permissions");
      }
    : null;

  const statusOptions = useMemo(
    () =>
      [
        { value: "all", label: t("settings.team.dirStatusAll") },
        { value: "active", label: t("settings.team.dirStatusActive") },
        { value: "invited", label: t("settings.team.dirStatusInvited") },
      ] as const,
    [t],
  );

  /**
   * Exports every row the filters match, not the page on screen.
   *
   * Re-fetches with page_size at the cap because "export" means the result set;
   * handing someone the twenty rows they can already see would be a worse answer
   * than refusing.
   */
  const handleExport = async () => {
    setExporting(true);
    setActionError(null);
    try {
      const all = await listAllTeamDirectory(dir.currentQuery);
      // The header in the reader's language, like the table it was exported
      // from; the cells stay as stored, so the file sorts and filters as data.
      const header = [
        t("settings.team.dirColMember"),
        t("settings.team.dirColEmail"),
        t("settings.team.dirColRole"),
        t("settings.team.dirColDepartment"),
        t("settings.team.dirColStatus"),
        t("settings.team.dirColCreated"),
      ];
      const lines = [header.map(csvCell).join(",")];
      // The file follows the screen: removed accounts are left out unless the
      // table is showing them.
      const rows = showDisabled ? all.members : all.members.filter((m) => m.status !== "disabled");
      for (const m of rows) {
        lines.push(
          [m.name, m.email, m.role, m.department, m.status, m.createdAt].map(csvCell).join(","),
        );
      }
      // A truncated export must say so. Handing someone a short file that looks
      // whole is worse than handing them nothing.
      if (!all.complete) {
        setActionError(
          t("settings.team.dirExportTruncated").replace("{count}", String(all.members.length)),
        );
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // It used to fail silently: the spinner stopped and no file came.
      setActionError(t("settings.team.dirExportFailed").replace("{reason}", teamErrorMessage(t, e)));
    } finally {
      setExporting(false);
    }
  };

  const sortControl = (id: DirectoryColumnId, label: string) => {
    const key = SORTABLE[id];
    // No key means mid-platform cannot sort by it, so no affordance is drawn.
    // An arrow on a column that does nothing is the worst kind of promise.
    if (!key) return <span>{label}</span>;
    const active = dir.filters.sortBy === key;
    const Icon = !active ? ArrowUpDown : dir.filters.order === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => dir.toggleSort(key)}
        className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className={cn("size-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    );
  };

  const hasFilters = dir.activeFilterCount > 0;
  const showEmpty = !dir.loading && !dir.error && visibleMembers.length === 0;
  // This page holds only removed accounts, which are hidden. "No members" would
  // be false (they are there, and Next may still be enabled), so it says why
  // the page looks empty instead.
  const onlyRemovedOnPage = showEmpty && dir.members.length > 0;
  // On a single page every row is here, so the removed ones can be taken out of
  // the total exactly. Across pages only this page's are known, so the server's
  // total stands.
  const shownTotal =
    !showDisabled && dir.totalPages <= 1 ? Math.max(0, dir.total - disabledCount) : dir.total;
  const departmentName = dir.filters.departmentId
    ? departments?.find((d) => d.id === dir.filters.departmentId)?.name ?? null
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{t("settings.team.subtabDirectory")}</h4>
        {/* Shown only to someone the backend would actually let invite. Before
            this check everybody saw the button, could fill the dialog in and
            got a 403 on send -- three testers reported it as "cannot add a
            member", which read like a broken endpoint rather than a missing
            right. Hidden until the answer is in, so it never appears and then
            vanishes. */}
        {invitePermission.checked && invitePermission.canInvite ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="gap-1.5 text-[12px]"
            onClick={() => setInviting(true)}
          >
            <UserPlus className="size-3.5" />
            {t("settings.team.inviteBtn")}
          </Button>
        ) : null}
      </div>

      {/* Toolbar: keep the controls readable without forcing the modal to scroll
          sideways. Controls wrap naturally when the available width is small. */}
      <div className="rounded-xl border border-border/70 bg-muted/15 p-2">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
          {searchOpen ? (
            <div className="relative w-full sm:w-[250px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                autoFocus
                value={dir.filters.search}
                onChange={(e) => dir.setFilters({ search: e.target.value })}
                onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
                placeholder={t("settings.team.dirSearchPlaceholder")}
                aria-label={t("settings.team.dirSearchPlaceholder")}
                className="h-9 w-full rounded-lg border border-primary/50 bg-background pl-8 pr-8 text-[13px] shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                aria-label={t("settings.team.dirClearFilters")}
                onClick={() => {
                  dir.setFilters({ search: "" });
                  setSearchOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-9 gap-1.5 text-[12px]", dir.filters.search && "border-primary font-semibold")}
              onClick={() => setSearchOpen(true)}
              aria-label={t("settings.team.dirSearchPlaceholder")}
            >
              <Search className="size-3.5" />
              {t("settings.team.dirSearchPlaceholder")}
            </Button>
          )}

        <DirectoryFilterCombobox
          value={dir.filters.status}
          onChange={(value) => dir.setFilters({ status: value as "all" | "active" | "invited" })}
          options={statusOptions}
            ariaLabel={t("settings.team.dirStatusLabel")}
        />

        {/* Only offered when the caller can read departments. A dropdown that
            always answers 403 is worse than one that is not there. */}
        {departments &&
        (departments.length > 0 || (DEPARTMENT_CREATE_AVAILABLE && invitePermission.canInvite)) ? (
          <DirectoryFilterCombobox
            value={dir.filters.departmentId}
            onChange={(value) => {
              if (value === "__create_department__") {
                setCreatingDepartment(true);
                return;
              }
              dir.setFilters({ departmentId: value });
            }}
            options={[
              { value: "", label: t("settings.team.dirDepartmentAll") },
              ...departments.map((department) => ({ value: department.id, label: department.name })),
              ...(DEPARTMENT_CREATE_AVAILABLE && invitePermission.canInvite
                ? [{ value: "__create_department__", label: `+ ${t("settings.team.departmentCreateButton")}` }]
                : []),
            ]}
              ariaLabel={t("settings.team.dirColDepartment")}
          />
        ) : null}

          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            disabled={exporting || dir.total === 0}
            onClick={() => void handleExport()}
          >
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {t("settings.team.dirExport")}
          </Button>
          <DirectoryColumnsMenu columns={columns} onToggle={toggleColumn} />
        </div>
      </div>
      </div>

      {inviting ? (
        <InviteMembersDialog
          onClose={() => setInviting(false)}
          // Reload rather than close: the new rows appear behind the dialog
          // while the per-address outcome is still readable in it.
          onInvited={() => dir.refresh()}
        />
      ) : null}
      <CreateDepartmentPanel
        open={creatingDepartment}
        onClose={() => setCreatingDepartment(false)}
        onCreated={(department) => {
          setDepartments((current) => [...(current ?? []), department]);
          dir.setFilters({ departmentId: "" });
        }}
        t={t}
      />
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} t={t} />

      {/* Applied filters — named, so an empty table has a visible cause. */}
      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {dir.filters.search.trim() ? (
            <button
              type="button"
              onClick={() => dir.setFilters({ search: "" })}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              “{dir.filters.search.trim()}”
              <X className="size-3" />
            </button>
          ) : null}
          {dir.filters.status !== "all" ? (
            <button
              type="button"
              onClick={() => dir.setFilters({ status: "all" })}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              {statusOptions.find((o) => o.value === dir.filters.status)?.label}
              <X className="size-3" />
            </button>
          ) : null}
          {/* The department filter counts as a filter, so it needs its chip:
              without one, "Clear all filters" appeared with no visible cause. */}
          {dir.filters.departmentId ? (
            <button
              type="button"
              onClick={() => dir.setFilters({ departmentId: "" })}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              {departmentName ?? t("settings.team.dirColDepartment")}
              <X className="size-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={dir.resetFilters}
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("settings.team.dirClearFilters")}
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {actionError}
        </div>
      ) : null}

      {dir.forbidden ? (
        // Being refused is not a fault to report in the API's own words: the
        // raw "Access denied" used to land here, untranslated, above a table of
        // zero rows.
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {t("settings.team.dirForbidden")}
        </div>
      ) : dir.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {teamErrorMessage(t, dir.failure)}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 font-semibold">
                {sortControl("member", t("settings.team.dirColMember"))}
              </th>
              {isVisible("email") ? (
                <th className="px-3 py-2 font-semibold">
                  {sortControl("email", t("settings.team.dirColEmail"))}
                </th>
              ) : null}
              {isVisible("role") ? (
                <th className="px-3 py-2 font-semibold">
                  {sortControl("role", t("settings.team.dirColRole"))}
                </th>
              ) : null}
              {isVisible("department") ? (
                <th className="px-3 py-2 font-semibold">{t("settings.team.dirColDepartment")}</th>
              ) : null}
              {isVisible("status") ? (
                <th className="px-3 py-2 font-semibold">
                  {sortControl("status", t("settings.team.dirColStatus"))}
                </th>
              ) : null}
              {isVisible("created") ? (
                <th className="px-3 py-2 font-semibold">
                  {sortControl("created", t("settings.team.dirColCreated"))}
                </th>
              ) : null}
              <th className="px-3 py-2 text-right font-semibold">
                {t("settings.team.dirColActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {dir.loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t("settings.team.loading")}
                  </span>
                </td>
              </tr>
            ) : showEmpty ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center">
                  <p className="text-[13px] font-semibold">
                    {onlyRemovedOnPage
                      ? t("settings.team.dirOnlyRemovedOnPage")
                      : hasFilters
                        ? t("settings.team.dirNoMatch")
                        : t("settings.team.noMembers")}
                  </p>
                  {hasFilters && !onlyRemovedOnPage ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {t("settings.team.dirNoMatchHint")}
                    </p>
                  ) : null}
                </td>
              </tr>
            ) : (
              visibleMembers.map((m) => (
                <tr key={m.userId} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        // Email first, as the settings avatar seeds it: the
                        // signed-in user's row and their own avatar then share
                        // one colour.
                        style={{ background: avatarColor(m.email || m.userId) }}
                        aria-hidden="true"
                      >
                        {avatarInitial(m.name, m.email)}
                      </span>
                      <span className="truncate font-semibold">{m.name}</span>
                    </span>
                  </td>
                  {isVisible("email") ? (
                    <td className="px-3 py-2 text-muted-foreground">{m.email}</td>
                  ) : null}
                  {isVisible("role") ? (
                    // The system roles in the reader's language, without the
                    // internal "CDP" prefix; anything else as stored. No CSS
                    // `capitalize` — it re-cased names it did not own.
                    <td className="px-3 py-2">{m.role ? companyRoleLabel({ name: m.role }, t) : "—"}</td>
                  ) : null}
                  {isVisible("department") ? (
                    <td className="px-3 py-2">
                      {m.department ? (
                        m.department
                      ) : (
                        <span className="italic text-muted-foreground">
                          {t("settings.team.dirNoDepartment")}
                        </span>
                      )}
                    </td>
                  ) : null}
                  {isVisible("status") ? (
                    <td className="px-3 py-2">
                      <StatusPill status={m.status} t={t} />
                    </td>
                  ) : null}
                  {isVisible("created") ? (
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {m.createdAt ? m.createdAt.slice(0, 10) : "—"}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <RowActions
                      member={m}
                      t={t}
                      busy={pendingRow === (m.invitationId || m.userId)}
                      isSelf={Boolean(myEmail) && m.email.trim().toLowerCase() === myEmail}
                      onInvitation={(action) => askInvitation(m, action)}
                      onRemove={() => askRemove(m)}
                      onChangeRole={changeRole}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        {disabledCount > 0 ? (
          <button
            type="button"
            aria-pressed={showDisabled}
            onClick={() => setShowDisabled((current) => !current)}
            className="rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {(showDisabled ? t("settings.team.dirHideDisabled") : t("settings.team.dirShowDisabled")).replace(
              "{count}",
              String(disabledCount),
            )}
          </button>
        ) : null}
        <span className="mr-auto tabular-nums">
          {t("settings.team.dirShowing")
            .replace("{shown}", String(visibleMembers.length))
            .replace("{total}", String(shownTotal))}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[12px]"
          disabled={dir.page <= 1 || dir.loading}
          onClick={() => dir.setPage(dir.page - 1)}
        >
          {t("settings.team.dirPrev")}
        </Button>
        <span className="tabular-nums">
          {dir.page} / {dir.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[12px]"
          disabled={!dir.hasNextPage || dir.loading}
          onClick={() => dir.setPage(dir.page + 1)}
        >
          {t("settings.team.dirNext")}
        </Button>
      </div>
    </div>
  );
}
