"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "@/components/ui";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import { nameToColor } from "@/resources/app/pages/app/components/Flow/helpers";

import { HOVER_FILL } from "../../styles";
import { useWorkspaceMemberCount } from "../../useWorkspaceMemberCount";

const DEFAULT_TEAM_NAME = "Default";

function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? "?").toUpperCase();
}

export const WorkspaceHeader = ({ collapsed = false }: { collapsed?: boolean }) => {
  const { t } = useTranslate();
  const { tenant, displayName } = useCurrentUser();
  const { teams, activeTeam, selectTeam, loading: teamsLoading } = useActiveTeam();
  const memberCount = useWorkspaceMemberCount(activeTeam?.id ?? null);
  const [open, setOpen] = useState(false);

  const teamName =
    activeTeam && activeTeam.name !== DEFAULT_TEAM_NAME ? activeTeam.name : null;
  const name =
    teamName ?? tenant?.name ?? (teamsLoading ? null : displayName || null);
  const canSwitch = teams.length > 0;

  const memberLabel =
    memberCount === null
      ? null
      : memberCount === 1
        ? t("appChat.flow.sidebar.memberOne")
        : t("appChat.flow.sidebar.memberMany").replace(
            "{count}",
            String(memberCount),
          );

  const tile = name ? (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 select-none items-center justify-center rounded-xl text-[16px] font-semibold text-white"
      style={{ backgroundImage: nameToColor(name) }}
    >
      {initialOf(name)}
    </span>
  ) : (
    <Skeleton className="size-10 shrink-0 rounded-xl" />
  );

  const text = (
    <span className="flex h-9 min-w-0 flex-1 flex-col justify-center gap-0.5">
      {name ? (
        <span className="truncate text-[13px] font-medium leading-tight text-neutral-900 dark:text-neutral-50">
          {/* A function replacer: a `$` in a team name would otherwise be read
              as a replacement pattern by String.replace. */}
          {t("appChat.flow.sidebar.workspaceSuffix").replace("{name}", () => name)}
        </span>
      ) : (
        <Skeleton className="h-3.5 w-32 rounded" />
      )}
      {memberLabel ? (
        <span className="truncate text-[11px] font-medium capitalize leading-none text-neutral-500 dark:text-neutral-400">
          {memberLabel}
        </span>
      ) : name ? null : (
        <Skeleton className="h-2.5 w-16 rounded" />
      )}
    </span>
  );

  const shell = "flex h-14 w-full items-center gap-3 rounded-[10px] p-2 pr-3 text-left";

  if (collapsed) {
    return (
      <div
        className="flex h-10 w-full items-center justify-center"
        title={name ?? undefined}
        data-learn="flow-home.workspace-switcher"
      >
        {tile}
      </div>
    );
  }

  if (!canSwitch) {
    return (
      <div className={shell} data-learn="flow-home.workspace-switcher">
        {tile}
        {text}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("appChat.flow.sidebar.switchWorkspace")}
          data-learn="flow-home.workspace-switcher"
          className={cn(shell, "transition-colors", HOVER_FILL)}
        >
          {tile}
          {text}
          <ChevronsUpDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-neutral-500 dark:text-neutral-400"
            strokeWidth={2}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[236px] rounded-xl border-neutral-200 p-1 dark:border-neutral-700"
      >
        <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold leading-none tracking-wide text-neutral-500 dark:text-neutral-400">
          {t("appChat.flow.sidebar.switchWorkspace")}
        </p>
      
        {teams.map((team) => {
          const isActive = team.id === activeTeam?.id;
          return (
            <button
              key={team.id}
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                setOpen(false);
                if (!isActive) selectTeam(team.id);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-medium transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800",
                isActive
                  ? "text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-600 dark:text-neutral-300",
              )}
            >
              <span className="truncate">
                {team.name === DEFAULT_TEAM_NAME
                  ? t("settings.team.defaultTeamName")
                  : team.name}
              </span>
              {isActive ? (
                <Check className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};
