"use client";

import type { ReactNode } from "react";

import { color, font, weight } from "@/components/dashboard/widgets/tokens";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

export type BlockState = "loading" | "ok" | "empty" | "error";

// The card frame for the chart and list blocks. WidgetShell is the frame for
// the four stat cards, but its header is a lone title — these blocks carry
// controls on the header row (the Credits Usage facets, the summary totals),
// and those must stay reachable while the body is loading or failed, or a
// broken filter could never be undone. Same tokens, same state vocabulary and
// the same `dashboard.state.*` strings, so the two frames read as one kit.
export function BlockFrame({
  title,
  rightSlot,
  state,
  onRetry,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  rightSlot?: ReactNode;
  state: BlockState;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const { t } = useTranslate();
  const muted = { fontSize: font.body, color: color.inkMuted };

  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-xl p-4 shadow-sm", className)}
      style={{ border: `1px solid ${color.border}`, background: color.bg }}
      data-state={state}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          className="truncate"
          style={{ fontSize: font.title, fontWeight: weight.title, color: color.inkPrimary }}
        >
          {title}
        </h3>
        {rightSlot ? <div className="flex flex-wrap items-center gap-2">{rightSlot}</div> : null}
      </div>

      {state === "ok" ? (
        <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
      ) : state === "loading" ? (
        <div className="flex flex-1 flex-col gap-2" aria-busy="true">
          <div className="h-40 w-full animate-pulse rounded" style={{ background: color.grid }} />
          <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: color.grid }} />
        </div>
      ) : state === "empty" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center" style={muted}>
          <span>{t("dashboard.state.empty")}</span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center" style={muted}>
          <span>{t("dashboard.state.error")}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border px-3 py-1"
              style={{ borderColor: color.border, color: color.inkPrimary, fontSize: font.body }}
            >
              {t("dashboard.state.retry")}
            </button>
          ) : null}
          <span style={{ fontSize: font.caption, color: color.inkMuted }}>
            {t("dashboard.state.retryHint")}
          </span>
        </div>
      )}
    </section>
  );
}

/** Map a block hook's flags onto the frame's state machine. */
export function blockState(params: {
  isLoading: boolean;
  failed: boolean;
  isEmpty: boolean;
}): BlockState {
  if (params.isLoading) return "loading";
  if (params.failed) return "error";
  if (params.isEmpty) return "empty";
  return "ok";
}
