"use client";

import { CircleHelp, Settings, Trash } from "lucide-react";

import type { CreditsRemaining } from "@/lib/flow/creditsRemaining";
import { cn } from "@/lib/utils";

import { ICON_BUTTON, ICON_STROKE } from "../../styles";
import { CreditsPill } from "./CreditsPill";

export const FlowSidebarFooter = ({
  remaining,
  showTrash,
  collapsed = false,
  onUpgrade,
  onOpenSettings,
  onOpenHelp,
  labels,
}: {
  remaining: CreditsRemaining | undefined;
  showTrash: boolean;
  collapsed?: boolean;
  onUpgrade: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  labels: {
    credits: { left: string; tokens: string; unknown: string; upgrade: string };
    trash: string;
    comingSoon: string;
    settings: string;
    help: string;
  };
}) => (
  <div
    className={cn(
      "mt-4 flex w-full shrink-0 gap-2",
      collapsed ? "flex-col items-center" : "items-center",
    )}
  >
    {collapsed ? null : (
      <CreditsPill remaining={remaining} onUpgrade={onUpgrade} labels={labels.credits} />
    )}
    <div
      className={cn(
        "flex shrink-0",
        collapsed ? "flex-col items-center" : "ml-auto items-center justify-end",
      )}
    >
      {showTrash ? (
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={`${labels.trash} — ${labels.comingSoon}`}
          title={`${labels.trash} — ${labels.comingSoon}`}
          disabled
        >
          <Trash className={cn("size-4", ICON_STROKE)} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={labels.settings}
        title={labels.settings}
        onClick={onOpenSettings}
      >
        <Settings className={cn("size-4", ICON_STROKE)} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={labels.help}
        title={labels.help}
        onClick={onOpenHelp}
      >
        <CircleHelp className={cn("size-4", ICON_STROKE)} aria-hidden="true" />
      </button>
    </div>
  </div>
);
