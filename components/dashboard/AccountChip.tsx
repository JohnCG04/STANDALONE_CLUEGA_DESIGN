"use client";

// Whose numbers these are — stated in the board's header, not implied by it.
//
// The account picker is skipped whenever the answer is unambiguous: one
// authorized account, an id the prompt named, or a workspace-level connection.
// That skip is correct — a one-choice list asks nothing — but it means the board
// can be scoped to an account the user never chose and never saw named. This
// chip is that disclosure, and the reason the picker is allowed to be skipped at
// all: what may be dropped is the LIST, never the confirmation.
//
// It replaced a 32px strip reading "Data for account 7588575096948948999": a
// label, and an id that identifies the account without naming it. The NAME is
// what a reader recognizes, so the name is what shows; the id and the reason the
// account was chosen move to the tooltip, where they are available to check
// without spending a row on them.
//
// DISCLOSURE ONLY — nothing here changes the account. Changing account is done
// by SAYING so in the chat ("đổi tài khoản quảng cáo", "switch ad account",
// "更換廣告帳戶", or by naming an id), which the dashboard planner detects
// (`wants_account_change`) and answers with the picker.
//
// The one thing the chip does is OPEN its own details — the full name, the id
// and how the account was decided (RD-A-08). They lived only in a `title`,
// which a mouse can hover and a keyboard, a screen reader and a phone cannot
// reach. The trigger is a real button for that reason, and the details are a
// read-only panel; the `title` stays for the hover it always served.
//
// The same chip states the account wherever the board is shown: the header,
// each widget's source line, and a card or row in My dashboards — one face,
// one details panel, so the identity cannot read differently in two places.
//
// 【中文】帳戶選擇器可略過，但「這是誰的數據」必須寫在標題列上；切換帳戶請在對話中提出。
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useTranslate } from "@/hooks/useTranslate";
import {
  accountColorAt,
  accountFace,
  CHIP_NAME_MAX,
  middleEllipsis,
  SHORT_NAME_MAX,
  type BoardAccountRef,
} from "@/lib/dashboard/boardAccounts";
import { cn } from "@/lib/utils";

export { CHIP_NAME_MAX };

export interface AccountChipProps {
  /** The resolved advertiser id. Always present on a rendered board. */
  advertiserId: string;
  /** The account's own name, when the account list carried one. */
  advertiserLabel?: string;
  /** "only" | "named" | "picked" | "tenant" | "run", or "" when unstated. */
  matchType?: string;
  /**
   * `header` (default) — the pill the board header has always drawn.
   * `inline` — the same disclosure set as text, for a line that already has its
   * own type (a widget's source line, a dashboard card or row).
   */
  variant?: "header" | "inline";
  /** The account's board colour: a dot leads the face (header variant). */
  dotColor?: string;
  /**
   * The room (px) on the board's narrowest card, decided once per board: a long
   * name that cannot fit it there is cut harder everywhere, never swapped for the id.
   */
  roomPx?: number;
  /**
   * COMPARE: pressing focuses this account across the board instead of opening
   * the details (a press cannot do both); the details stay in the `title` and
   * on the header chip's list.
   */
  onToggleFocus?: () => void;
  focused?: boolean;
  className?: string;
}

// A short name is never cut; only a long one is capped so it cannot push the controls.
const capFor = (name: string) => (Array.from(name).length > SHORT_NAME_MAX ? "max-w-[40cqw]" : "shrink-0");

const HEADER_CHIP =
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 text-[10px] font-medium leading-5 text-muted-foreground hover:bg-muted/70";

const dotStyle = (color: string) => ({ background: color });

/**
 * The grouped chip of a COMPARE board: stacked dots + count. With a scope action
 * (`renderScope` wraps it in the board's "Sources and accounts" popover; else
 * `onOpenScope`) a press opens that and the accounts stay in the `title`; with
 * neither, a press lists every account.
 */
export function AccountGroupChip({
  accounts,
  className,
  renderScope,
  onOpenScope,
}: {
  accounts: readonly BoardAccountRef[];
  className?: string;
  renderScope?: (chip: ReactElement) => ReactNode;
  onOpenScope?: () => void;
}) {
  const { t } = useTranslate();
  if (accounts.length === 0) return null;
  const label = t("dashboard.account.count").replace("{count}", String(accounts.length));
  if (renderScope || onOpenScope) {
    const names = accounts.map((a) => a.name || a.id).join(", ");
    const chip = (
      <button
        type="button"
        data-testid="account-group-chip"
        title={`${t("dashboard.accounts.scopeChipTitle")}: ${names}`}
        aria-label={label}
        onClick={renderScope ? undefined : onOpenScope}
        className={cn(HEADER_CHIP, "shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/40", className)}
      >
        <span aria-hidden="true" className="flex shrink-0 items-center -space-x-1">
          {accounts.map((a, i) => (
            <span key={a.id} className="size-2 rounded-full ring-1 ring-background" style={dotStyle(accountColorAt(i))} />
          ))}
        </span>
        <span className="truncate">{label}</span>
      </button>
    );
    return renderScope ? <>{renderScope(chip)}</> : chip;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="account-group-chip"
          data-state={undefined}
          title={accounts.map((a) => a.name || a.id).join(", ")}
          aria-label={label}
          onClick={keepPress}
          onKeyDown={keepPress}
          className={cn(HEADER_CHIP, "shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/40", className)}
        >
          <span aria-hidden="true" className="flex shrink-0 items-center -space-x-1">
            {accounts.map((a, i) => (
              <span key={a.id} className="size-2 rounded-full ring-1 ring-background" style={dotStyle(accountColorAt(i))} />
            ))}
          </span>
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={12}
        data-testid="account-group-list"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="w-auto min-w-[12rem] max-w-[min(20rem,calc(100vw-24px))] p-3 text-[12px] leading-5"
      >
        <p className="font-medium text-foreground">{t("dashboard.account.listLabel")}</p>
        <ul className="mt-1.5 space-y-1">
          {accounts.map((a, i) => (
            <li key={a.id} className="flex min-w-0 items-center gap-1.5 text-foreground">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={dotStyle(accountColorAt(i))} />
              <span className="min-w-0 break-words">{a.name || a.id}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// The trigger sits inside surfaces that act on a press: a widget card selects
// itself on click and on Enter/Space (calling preventDefault, which would stop
// this button from opening), and a dashboard card is one stretched link. The
// chip's own press is for the chip.
const keepPress = (event: MouseEvent | KeyboardEvent) => {
  if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
  event.stopPropagation();
};

/** The reason line for a lock the user did not choose, or null. */
function reasonKeyFor(matchType: string | undefined): string | null {
  // Explicit allowlist, not a template: an unrecognized value from a future
  // producer must render NO reason rather than a missing-translation key.
  if (matchType === "only") return "dashboard.account.only";
  if (matchType === "named") return "dashboard.account.named";
  if (matchType === "tenant") return "dashboard.account.tenant";
  // Locked to the account the ad run bought on (the Sales App post-run board).
  if (matchType === "run") return "dashboard.account.run";
  return null;
}

export function AccountChip({
  advertiserId,
  advertiserLabel,
  matchType,
  variant = "header",
  dotColor,
  roomPx,
  onToggleFocus,
  focused,
  className,
}: AccountChipProps) {
  const { t } = useTranslate();
  if (!advertiserId) return null;

  const isTenant = matchType === "tenant";
  // A label that IS the id is not a name. The producer already strips this
  // (`_account_label` returns "" when the account list fell back to the id), and
  // it is checked again here because this component now guarantees that no id
  // reaches the screen — a guarantee that cannot depend on a normalizer one
  // service away.
  const label = advertiserLabel?.trim();
  const name = label && label !== advertiserId ? label : "";
  const reason = reasonKeyFor(matchType);
  // A workspace connection has no advertiser_id — the producer sends the
  // sentinel "active". Printing it would tell the user their account is called
  // "active", so that case shows its reason line as the whole statement.
  //
  // THE ID IS NEVER THE DISPLAY VALUE. It used to be the fallback, on the
  // grounds that an id still identifies the account unambiguously. It does, and
  // it is also unreadable: a header reading "7588575096948948..." (truncated at
  // 128px, so not even the whole id) names nothing a reader recognises, and
  // there is no path from it to the name on screen. The producer resolves a name
  // on a best-effort basis — `_account_label` returns "" for a platform with no
  // list tool, a failed call, or an id outside the tenant's list — so this has
  // to hold whatever arrives: a name when there is one, otherwise a word that
  // says what the chip is FOR. The id stays in the tooltip, where it can still
  // be checked and copied.
  const shown = isTenant
    ? reason
      ? t(reason)
      : t("dashboard.account.unnamed")
    : name || t("dashboard.account.unnamed");
  // Everything the strip used to print, kept where it can be checked: the full
  // NAME (the chip truncates at 128px, so the displayed text may be an
  // ellipsis), the id, and how the account was decided.
  //
  // The id is UNCONDITIONAL now (outside the workspace-connection case, which
  // has none): it left the chip face, so the tooltip is the only place it
  // remains, and an unnamed account is exactly the case where a reader needs it
  // — that is the one where the face says nothing specific at all.
  // The face on a narrow surface is the name cut harder, never the id. Never for a workspace
  // connection (it has no id) — that chip states its reason line instead.
  const face = isTenant ? middleEllipsis(shown, CHIP_NAME_MAX) : accountFace(shown, CHIP_NAME_MAX, roomPx);
  const detail = [
    isTenant ? "" : shown,
    isTenant ? "" : advertiserId,
    reason && !isTenant ? t(reason) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (onToggleFocus) {
    return (
      <button
        type="button"
        data-testid="account-chip"
        data-match-type={matchType || "unstated"}
        title={detail || undefined}
        aria-label={t("dashboard.account.detailsLabel").replace("{name}", shown)}
        aria-pressed={!!focused}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFocus();
        }}
        onKeyDown={keepPress}
        className={cn(
          "block min-w-0 max-w-full shrink cursor-pointer truncate rounded-sm text-left underline decoration-dotted decoration-from-font underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40",
          focused && "text-foreground ring-2 ring-foreground/60 ring-offset-1 ring-offset-background",
          className,
        )}
      >
        {shown}
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="account-chip"
          data-match-type={matchType || "unstated"}
          // Radix stamps `data-state="open|closed"` on a trigger. Inside a
          // widget that attribute already MEANS the widget's state
          // (`WidgetShell`'s root), and whatever reads a widget's state reads it
          // there — so the chip does not carry one. `aria-expanded` says whether
          // its details are open.
          data-state={undefined}
          title={detail || undefined}
          // The face is the name; the accessible name says what pressing it
          // does, so a screen reader hears more than a bare shop name.
          aria-label={t("dashboard.account.detailsLabel").replace("{name}", shown)}
          onClick={keepPress}
          onKeyDown={keepPress}
          className={cn(
            "min-w-0 shrink cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
            variant === "header"
              ? // One line, h-5, never pushing the title: at most 40% of the
                // header (`cqw`, the board header is a container); the name is
                // cut in the MIDDLE by characters, the full one is in `title`.
                `${HEADER_CHIP} ${capFor(shown)}`
              : "block max-w-full truncate rounded-sm underline decoration-dotted decoration-from-font underline-offset-2 hover:text-foreground",
            className,
          )}
        >
          {variant === "header" ? (
            <>
              {dotColor ? (
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={dotStyle(dotColor)} />
              ) : null}
              <span className="min-w-0 truncate">{face}</span>
            </>
          ) : (
            shown
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={12}
        data-testid="account-details"
        // The panel is portalled, but React still bubbles its events up the
        // tree that rendered it — into the widget card, whose press SELECTS the
        // card and whose pointerdown on a selected card starts a drag (and
        // calls preventDefault, which cancels text selection). Stopped here so
        // the name and the id can be selected and copied; never prevented.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="w-auto min-w-[12rem] max-w-[min(20rem,calc(100vw-24px))] p-3 text-[12px] leading-5"
      >
        <p className="font-medium text-foreground">{t("dashboard.account.unnamed")}</p>
        {isTenant ? null : (
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t("dashboard.account.nameLabel")}</dt>
            {/* The WHOLE name — the face may be an ellipsis. */}
            <dd className="min-w-0 break-words text-foreground">{name || t("dashboard.account.unnamed")}</dd>
            <dt className="text-muted-foreground">{t("dashboard.account.idLabel")}</dt>
            {/* Selectable as one piece, so it can be copied and checked. */}
            <dd className="min-w-0 select-all break-all font-mono text-[11px] text-foreground">{advertiserId}</dd>
          </dl>
        )}
        {/* The details are the account: its name and its id. How it was chosen
            is not repeated here — except for a workspace connection, which has
            no name or id, so that line is the only thing there is to state. */}
        {isTenant && reason ? <p className="mt-1.5 text-muted-foreground">{t(reason)}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
