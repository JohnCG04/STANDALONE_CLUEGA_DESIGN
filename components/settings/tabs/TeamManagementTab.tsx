"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useCanInviteMembers } from "@/hooks/useCanInviteMembers";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  addTeamMember,
  createTeam,
  getCompanyMembers,
  getTeamMembers,
  MY_TEAMS_QUERY_KEY,
  removeTeamMember,
  updateTeamMember,
  type CompanyUser,
  type TeamMember,
} from "@/lib/teams/cdp-teams";
import { teamErrorMessage } from "@/lib/teams/team-error.lib";
import { isSnapshotFresh } from "@/lib/query/cachedSnapshot";
import { cn } from "@/lib/utils";
import { SettingsSubTabs } from "@/components/settings/SettingsSubTabs";
import { TeamDirectoryPanel } from "@/components/settings/tabs/team/TeamDirectoryPanel";

/** One team's roster plus the pool it can be added from. */
type TeamCache = {
  members: TeamMember[];
  company: CompanyUser[];
};

/**
 * How long a team's roster counts as current.
 *
 * Short because membership is edited from this very tab — and every one of those
 * edits reloads with `force`, so the window only covers coming back to the tab.
 */
const TEAM_FRESH_MS = 30_000;

const ROLES = ["owner", "admin", "member"] as const;
type TeamRole = (typeof ROLES)[number];

/** A change that takes effect on confirm, and the toast it leaves behind. */
type PendingChange = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
  run: () => Promise<void>;
  doneKey: string;
};

/* ─── Reusable custom Select ──────────────────────────────────────────────── */
interface CustomSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

function CustomSelect({
  value,
  onValueChange,
  disabled,
  options,
  placeholder,
  triggerClassName,
}: CustomSelectProps) {
  // Radix requires value to be undefined (not "") to show placeholder
  const radixValue = value === "" ? undefined : value;
  return (
    <SelectPrimitive.Root value={radixValue} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex items-center justify-between gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700",
          "bg-white dark:bg-neutral-900 px-2.5 py-1 text-sm font-semibold",
          "text-neutral-900 dark:text-neutral-100",
          "focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600",
          "disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-50 min-w-[8rem] overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700",
            "bg-white dark:bg-neutral-900 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold outline-none",
                  "text-neutral-900 dark:text-neutral-100",
                  "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                  "data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ─── TeamManagementTab ───────────────────────────────────────────────────── */
export function TeamManagementTab() {
  const { t } = useTranslate();
  // Local, not URL-backed: the settings modal has no route of its own, so a
  // query param here would outlive the modal and reopen it on the wrong view.
  // Directory first: the Members roster is switched off for now (see the tab list below).
  const [subTab, setSubTab] = useState<"members" | "directory">("directory");
  const {
    teams,
    activeTeam,
    selectTeam,
    loading: teamsLoading,
    failed: teamsFailed,
  } = useActiveTeam();
  const teamId = activeTeam?.id ?? null;
  const canManage = activeTeam?.teamRole === "owner" || activeTeam?.teamRole === "admin";
  // The same company-administrator answer the Directory uses for Invite — one
  // question, one answer, on both sub-tabs.
  const companyAdmin = useCanInviteMembers();
  // Owners of the active team, and company administrators: the backend lets
  // both create a team, and the panel's own copy says administrators can.
  const canCreate =
    activeTeam?.teamRole === "owner" || (companyAdmin.checked && companyAdmin.canInvite);
  const me = useCurrentUser();
  const myEmail = me.email.trim().toLowerCase();
  const isSelf = (m: TeamMember) => Boolean(myEmail) && m.email.trim().toLowerCase() === myEmail;

  /**
   * 無法添加下屬成員 · "Request failed: 502".
   *
   * Only 403 used to be translated; everything else printed the raw string
   * `teamData` builds, which for a gateway failure is `Request failed: 502` —
   * a number beside the Add button, reading as though the reader's input was
   * refused. The classification moved to `teamErrorMessage` so every caller in
   * this tab gets the same sentence, and so the mapping is testable.
   */
  const friendlyErr = useCallback(
    (e: unknown) => teamErrorMessage(t, e),
    [t],
  );

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [company, setCompany] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The cache lives in app/app/layout.tsx, which switching tabs does not remount —
  // unlike this tab.
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickUser, setPickUser] = useState("");
  const [pickRole, setPickRole] = useState("member");
  const [newTeam, setNewTeam] = useState("");

  const load = useCallback(
    async (force = false) => {
      if (!teamId) return;

      // Switching a settings tab unmounts it, so every return here re-read the
      // team. `force` comes from `run`, which is how every add, remove and role
      // change reloads — those must see the server's own list.
      const cacheKey = ["settings", "team-members", teamId] as const;
      if (!force) {
        const cached = queryClient.getQueryData<TeamCache>(cacheKey);
        const cachedAt = queryClient.getQueryState(cacheKey)?.dataUpdatedAt;
        if (cached && isSnapshotFresh(cachedAt, Date.now(), TEAM_FRESH_MS)) {
          setMembers(cached.members);
          setCompany(cached.company);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        /*
          The roster is fetched on its own, and the ADDABLE POOL is allowed to
          fail without taking it down.

          `Promise.all` rejects on the first failure, so a company-directory
          error blanked the member list too — the reader lost the roster they
          came to look at, and the screen said only that something failed. The
          two answer different questions: who is in this team, and who could be
          added to it. Only the second one needs the company endpoint.
        */
        const m = await getTeamMembers(teamId);
        setMembers(m);

        let c: CompanyUser[] = [];
        if (canManage) {
          try {
            c = await getCompanyMembers();
          } catch (e) {
            // Named, not swallowed: with an empty pool the picker below says
            // "everybody is already in the team", which would be a lie here.
            setError(friendlyErr(e));
          }
        }
        setCompany(c);
        queryClient.setQueryData<TeamCache>(cacheKey, { members: m, company: c });
      } catch (e) {
        setError(friendlyErr(e));
      } finally {
        setLoading(false);
      }
    },
    [teamId, canManage, friendlyErr, queryClient],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const addableUsers = useMemo(() => {
    const inTeam = new Set(members.map((m) => m.userId));
    return company.filter((u) => !inTeam.has(u.id));
  }, [company, members]);

  const run = useCallback(
    async (fn: () => Promise<void>, doneKey?: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        await load(true);
        // The team list is cached for five minutes and carries the reader's own
        // role in each team. A new team would stay out of the switcher, and a
        // changed role would keep showing controls it no longer grants.
        await queryClient.invalidateQueries({ queryKey: MY_TEAMS_QUERY_KEY });
        // Every change used to finish in silence; the list redrawing was the
        // only sign anything had happened.
        if (doneKey) setNotice(t(doneKey));
      } catch (e) {
        setError(friendlyErr(e));
      } finally {
        setBusy(false);
      }
    },
    [load, friendlyErr, queryClient, t],
  );

  const confirmPending = () => {
    const change = pending;
    setPending(null);
    if (change) void run(change.run, change.doneKey);
  };

  const memberName = (m: TeamMember) =>
    [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || m.userId;
  // Removed from the workspace (the account is disabled) but still on the team
  // roster upstream. Shown as such, not as an ordinary member.
  const isRemovedAccount = (m: TeamMember) => m.status === "disabled";
  const roleLabel = (role: string) =>
    ROLES.includes(role as TeamRole) ? t(`settings.team.roles.${role}`) : role;
  const teamName = (name: string) =>
    name === "Default" ? t("settings.team.defaultTeamName") : name;

  const teamOptions = teams.map((tm) => ({ value: tm.id, label: teamName(tm.name) }));
  const roleOptions = ROLES.map((r) => ({ value: r, label: roleLabel(r) }));
  const userOptions = addableUsers.map((u) => ({ value: u.id, label: u.email }));

  if (teamsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
        <Loader2 className="size-4 animate-spin" />
        {t("settings.team.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-2rem))] p-6">
          <DialogTitle>{pending?.title ?? ""}</DialogTitle>
          <DialogDescription className="mt-1">{pending?.body ?? ""}</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPending(null)}>
              {t("settings.common.cancel")}
            </Button>
            <Button
              type="button"
              variant={pending?.destructive ? "destructive" : "primary"}
              onClick={confirmPending}
            >
              {pending?.confirmLabel ?? ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <h3 className="text-lg font-semibold">{t("settings.team.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground font-semibold">{t("settings.team.desc")}</p>
      </div>

      {/* Two views of the same people, kept separate on purpose.
          "Thành viên" is the team roster and stays exactly as it was — it is
          enough for a small team and people already know where things are.
          "Quản lý chi tiết" is the tenant-wide directory with search, sorting
          and paging, for the tenants where scrolling a full list stopped being
          practical. Replacing the first with the second would make everyone
          learn a bigger screen to do what they already do. */}
      <SettingsSubTabs
        tabs={[
          { id: "directory", label: t("settings.team.subtabDirectory") },
          // Switched off until it is developed further; the roster code below is kept as it was.
          { id: "members", label: t("settings.team.subtabMembers"), disabled: true },
        ]}
        activeId={subTab}
        onChange={(id) => setSubTab(id === "directory" ? "directory" : "members")}
      />

      {subTab === "directory" ? <TeamDirectoryPanel /> : null}

      {subTab === "members" ? (
      <div className="space-y-8">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {notice}
        </div>
      ) : null}

      {activeTeam ? (
        <section className="rounded-xl border border-border p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">{t("settings.team.current")}:</span>
              {teams.length > 1 ? (
                <CustomSelect
                  value={activeTeam.id}
                  onValueChange={selectTeam}
                  disabled={busy}
                  options={teamOptions}
                  triggerClassName="min-w-0"
                />
              ) : (
                <span className="truncate font-medium">{teamName(activeTeam.name)}</span>
              )}
            </div>
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
              {roleLabel(activeTeam.teamRole)}
            </span>
          </div>

          <h4 className="mb-2 text-sm font-semibold">{t("settings.team.members")}</h4>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
              <Loader2 className="size-4 animate-spin" />
              {t("settings.team.loading")}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((m) => {
                const name = memberName(m);
                const self = isSelf(m);
                const removed = isRemovedAccount(m);
                return (
                <li
                  key={m.userId}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-2.5 text-sm",
                    removed && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {self ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {t("settings.team.you")}
                        </span>
                      ) : null}
                      {removed ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {t("settings.team.dirStatusDisabled")}
                        </span>
                      ) : null}
                    </div>
                    {/* Only when it adds something: with no first or last name the
                        name above already IS the email, and the row said it twice. */}
                    {m.email && m.email !== name ? (
                      <div className="truncate text-xs text-muted-foreground font-semibold">{m.email}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Your own row is read-only here. Demoting or removing
                        yourself takes away the very rights needed to undo it, and
                        the backend only stops the case of the LAST owner. */}
                    {canManage && !self && !removed ? (
                      <>
                        <CustomSelect
                          value={m.teamRole}
                          onValueChange={(v) => {
                            if (v === m.teamRole) return;
                            setPending({
                              title: t("settings.team.roleChangeTitle"),
                              body: t("settings.team.roleChangeConfirm")
                                .replace("{name}", name)
                                .replace("{role}", roleLabel(v)),
                              confirmLabel: t("settings.team.roleChangeAction"),
                              destructive: false,
                              run: () => updateTeamMember(teamId!, m.userId, v),
                              doneKey: "settings.team.roleChanged",
                            });
                          }}
                          disabled={busy}
                          options={roleOptions}
                          triggerClassName="text-xs"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setPending({
                              title: t("settings.team.removeFromTeamTitle"),
                              body: t("settings.team.removeFromTeamConfirm").replace("{name}", name),
                              confirmLabel: t("settings.team.remove"),
                              destructive: true,
                              run: () => removeTeamMember(teamId!, m.userId),
                              doneKey: "settings.team.memberRemoved",
                            })
                          }
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 font-semibold"
                          aria-label={t("settings.team.remove")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground font-semibold">{roleLabel(m.teamRole)}</span>
                    )}
                  </div>
                </li>
                );
              })}
              {members.length === 0 ? (
                <li className="px-4 py-3 text-center text-sm text-muted-foreground font-semibold">
                  {t("settings.team.noMembers")}
                </li>
              ) : null}
            </ul>
          )}

          {/*
            NOBODY LEFT TO ADD IS NOT THE SAME AS "you cannot add members", and
            the difference is what this block exists to say.

            This picker moves an EXISTING company user into the team. It lists
            active company users who are not already in it, so in a tenant whose
            active users are all in the team it is legitimately empty — and it
            used to be an empty, greyed dropdown with a label reading 添加成員
            and nothing else. QA read that as the feature being broken and filed
            it twice: once here (X-P-01 step 2, "新增不了新成員，測不了刪除") and
            once from the report side, where it blocked the whole share-with-a-
            colleague branch (R-H-15).

            Inviting somebody NEW is a different action and lives on the other
            sub-tab, which is why nothing on this one hinted at it. The sentence
            names the reason and the button goes there.
          */}
          {/* `!error` matters: a failed company fetch also leaves the pool
              empty, and "everybody is already in the team" would then be a
              lie. The error line above owns that case. */}
          {canManage && addableUsers.length === 0 && !loading && !error ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
              {/* Inviting needs the COMPANY administrator role, which a team
                  admin may not hold. Sending them to the Directory then landed
                  on a page with no Invite button; they are told who can instead. */}
              <span className="text-xs leading-relaxed text-muted-foreground">
                {companyAdmin.checked && !companyAdmin.canInvite
                  ? t("settings.team.noAddableUsersAskAdmin")
                  : t("settings.team.noAddableUsers")}
              </span>
              {companyAdmin.checked && companyAdmin.canInvite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSubTab("directory")}
                >
                  <UserPlus className="size-4" />
                  {t("settings.team.goInvite")}
                </Button>
              ) : null}
            </div>
          ) : canManage ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("settings.team.addMember")}
                </label>
                <CustomSelect
                  value={pickUser}
                  onValueChange={setPickUser}
                  disabled={busy || addableUsers.length === 0}
                  options={userOptions}
                  placeholder={t("settings.team.selectUser")}
                  triggerClassName="w-full py-1.5"
                />
              </div>
              <CustomSelect
                value={pickRole}
                onValueChange={setPickRole}
                disabled={busy}
                options={roleOptions}
                triggerClassName="py-1.5"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={busy || pickUser === ""}
                onClick={() =>
                  run(async () => {
                    await addTeamMember(teamId!, pickUser, pickRole);
                    setPickUser("");
                  }, "settings.team.memberAdded")
                }
              >
                <UserPlus className="size-4" />
                {t("settings.team.addMemberBtn")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : teamsFailed ? (
        // A failed list is not "you are in no team". Saying so sent people
        // looking for a membership they in fact had.
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{t("settings.team.teamsLoadFailed")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void queryClient.invalidateQueries({ queryKey: MY_TEAMS_QUERY_KEY })}
          >
            {t("settings.common.retry")}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground font-semibold">
          {t("settings.team.noTeam")}
        </div>
      )}

      {canCreate ? (
      <section className="rounded-xl border border-border p-5">
        <h4 className="mb-1 text-sm font-semibold">{t("settings.team.createTeam")}</h4>
        <p className="mb-3 text-xs text-muted-foreground font-semibold">{t("settings.team.createTeamDesc")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            placeholder={t("settings.team.createTeamPlaceholder")}
            disabled={busy}
            className="min-w-[200px] flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-300 dark:focus:border-neutral-600"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || newTeam.trim() === ""}
            onClick={() =>
              run(async () => {
                await createTeam(newTeam.trim());
                setNewTeam("");
              }, "settings.team.teamCreated")
            }
          >
            <Plus className="size-4" />
            {t("settings.team.createTeamBtn")}
          </Button>
        </div>
      </section>
      ) : null}
      </div>
      ) : null}
    </div>
  );
}
