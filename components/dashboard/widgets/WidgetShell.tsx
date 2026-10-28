"use client";

import type { ReactNode } from "react";
import { Clock, Hourglass, Inbox, Info, Lock, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HoverTooltip } from "@/resources/app/components/ui/HoverTooltip";
import { useTranslate } from "@/hooks/useTranslate";
import { AccountChip } from "@/components/dashboard/AccountChip";
import { accountColorAt, accountColorOf } from "@/lib/dashboard/boardAccounts";
import { dimmedFor, useBoardAccounts } from "./boardAccountsContext";
import { color, font, paletteFor, weight, tabular, tracking } from "./tokens";
import type { WidgetPalette } from "./tokens";
import { useFreshnessLabel } from "./dashboardNow";
import { emptyNoteText, missingCauseText, noteText as shownNote, type EmptyWhy } from "./missingReason";
import type { WidgetState } from "./types";
import { useWidgetActions, type WidgetActions } from "./widgetActionsContext";
import { clockTime, retryAt } from "./stateTiming";
import type { StateTiming } from "./stateTiming";
import { calendarSpan, formatPeriod, previousDaysCount } from "./widgetPeriod";
import { useChatSurface } from "./widgetSurfaceContext";

interface WidgetShellProps {
  state: WidgetState;
  title?: string;
  subtitle?: string;
  syncedAt?: string;
  footnoteRight?: string;
  /** Sits right after the title on its row (a line chart's legend). */
  titleAside?: ReactNode;
  /** Nền tảng cấp số cho widget này ("TikTok Ads"). In CÙNG HÀNG với tiêu đề,
   *  canh phải, ghép vào dòng đồng bộ ("TikTok Ads · Cập nhật 1 phút trước"):
   *  nó là xuất xứ của số, cùng loại thông tin với "đo lúc nào". Chuyển lên
   *  đây từ chân widget 2026-09-19 theo yêu cầu sản phẩm — đọc nguồn/độ mới
   *  NGAY khi thấy tiêu đề, và chân widget rảnh ra cho đúng một thứ: ghi chú
   *  về NỘI DUNG (`footnoteRight`). */
  platform?: string;
  tone?: "default" | "alert";
  onRetry?: () => void;
  onReauthorize?: () => void;
  children?: ReactNode;
  className?: string;
  /** Câu thay cho empty-state mặc định. Mặc định là "Không có dữ liệu trong
   *  khoảng thời gian đã chọn" — đúng khi cửa sổ rỗng, SAI khi nguồn không hề
   *  có trường đó: nó mời người đọc đổi ngày để sửa một thứ đổi ngày không
   *  sửa được. Producer gửi lý do qua `config.unavailable_reason`: a string, or
   *  `{vi, en, zh}` shown in the UI language (`noteText`). */
  emptyText?: unknown;
  /** Why the value is missing: the source's reason code is worded here in the reader's language, ahead of `emptyText`, and the metric note rides under it. */
  emptyWhy?: EmptyWhy;
  /** The producer's note on the figure (the by-day note), shown in a tooltip from an info icon. */
  note?: unknown;
  /** The source's note (config.source_note: a string, or `{vi, en, zh}` in the UI language), joined to `note` in the same info tooltip. */
  sourceNote?: unknown;
  /** Suppress the per-widget "Updated Xh ago" caption. */
  hideSynced?: boolean;
  /** Compact spacing (smaller padding + tighter title/subtitle/footnote gaps).
   * KPI cards set it: one short value + labels sits in a half-empty box under
   * the default chart spacing, worse when the panel is narrow and cards go wide. */
  dense?: boolean;
  /**
   * Bảng màu của khung thẻ. OPT-IN: vắng thì lấy đúng bảng token cũ, nên mọi
   * widget hiện có render ra chuỗi CSS không đổi. Card chỉ nhận bảng khác khi
   * board của nó khai báo `presentation` — xem paletteFor trong tokens.ts.
   */
  palette?: WidgetPalette;
  /** Nền thẻ, khi thứ hạng của thẻ cần một mặt nền khác. Vắng → `palette.bg`. */
  surface?: string;
  /**
   * Vạch nhấn mảnh chạy dọc mép TRÊN thẻ. Vắng → không vẽ gì, đúng như mọi
   * widget hiện có.
   *
   * Chỉ là đường viền, không phải nền: một băng KPI toàn thẻ trắng trên nền
   * trắng đọc ra là bốn ô rỗng, còn tô nền cả thẻ thì bốn con số quan trọng
   * nhất lại chìm sau một mảng màu. Vạch 2px nói "đây là một chỉ số" mà không
   * lấy mất chỗ của con số.
   */
  accentTop?: string;
  /**
   * The card's body is ONE headline number (a KPI card). The number is then
   * the only heavy thing on the card: the title reads as its label (12px,
   * medium, secondary ink) and sits tight on the period line, which keeps its
   * distance from the number instead.
   */
  hero?: boolean;
}

// Khung nền dùng chung + máy 8 trạng thái (§7.8). Widget con chỉ render khi ok/ok_stale.
export function WidgetShell({
  state,
  title,
  subtitle,
  syncedAt,
  footnoteRight,
  titleAside,
  platform,
  tone = "default",
  onRetry,
  onReauthorize,
  children,
  className,
  emptyText,
  emptyWhy,
  note,
  sourceNote,
  hideSynced = false,
  dense = false,
  palette,
  surface,
  accentTop,
  hero = false,
}: WidgetShellProps) {
  const p = palette ?? paletteFor();
  const { t, lang } = useTranslate();
  // The board's per-slot actions (`widgetActionsContext`), used when the widget
  // passed none of its own — no widget does today, so this is how a retry or a
  // re-authorise button reaches every cell.
  const actions = useWidgetActions();
  const boardView = useBoardAccounts();
  // A chat board has no "…" menu and no fixed row to keep: its text wraps rather than clips.
  const chat = useChatSurface();
  onRetry = onRetry ?? actions.onRetry;
  onReauthorize = onReauthorize ?? actions.onReauthorize;
  const isAlert = tone === "alert";
  const showChildren = state === "ok" || state === "ok_stale";
  /**
   * Chân widget cũng in cho trạng thái EMPTY — nửa còn lại của B-R-01.
   *
   * "Không có dữ liệu" mà không kèm mốc thời gian là một câu chưa nói hết: người
   * đọc không biết đó là "vừa hỏi xong, thật sự không có" hay "số liệu này đã cũ
   * hai tiếng". `synced_at` trả lời đúng câu đó và nó vẫn có mặt trên slot rỗng.
   *
   * Chỉ mở cho `empty`, không mở cho loading/error/timeout/quota: ba trạng thái
   * sau chưa lấy được gì nên chưa có mốc để nói, còn loading thì đang nói rồi.
   * `footnoteRight` vẫn khoá theo `showChildren` — nó là ghi chú VỀ nội dung
   * (chú thích trục, gợi ý hover), và in nó cạnh một khung rỗng là mô tả thứ
   * không có trên màn hình.
   */
  const showFootnote = showChildren || state === "empty";

  // Nhãn độ mới, tính từ đồng hồ CHUNG của bảng chứ không phải `Date.now()` đọc
  // lúc render. Đó chính là B-R-01: `Date.now()` trong thân component không
  // khiến React render lại, nên nhãn đứng yên ở giá trị lúc sơn lần đầu và một
  // bảng mở một tiếng vẫn đọc là "vừa xong".
  //
  // `null` (rỗng/không parse được) thì bỏ qua footnote thay vì in ISO thô hoặc
  // "Invalid Date". Cùng một hook với MediaCard và chân bảng, nên ba chỗ không
  // thể diễn đạt cùng một thời điểm theo hai kiểu.
  // Which days the numbers are (RD-T-07). Only the line chart's title used to
  // name a window, and by bucket, so a KPI card or a table could not be told
  // apart from last month's. The dates the fetch used, on every data cell; the
  // baseline window on hover, since the arrow's label stays the short phrase.
  const period = actions.period;
  // The board's header line states source, freshness and compare window once
  // (`metaStatedByBoard`), and the period when this card's equals the board's
  // (`periodStatedByBoard`). A card whose window DIFFERS keeps its own. The
  // account chip stays on every card: WHOSE data it is, one press from the full
  // name and id (RD-A-08).
  const metaStated = Boolean(actions.metaStatedByBoard);
  const sourceAccount = actions.sourceAccount;
  const shownPlatform = metaStated ? undefined : platform;
  // An exhausted empty card found nothing: it says how far it looked and what was
  // asked, never a data period, and has no prior window to compare against.
  const exhausted = actions.statesCheckedWindow && state === "empty" && actions.timeRange?.state === "exhausted"
    ? actions.timeRange
    : undefined;
  const checked = exhausted ? calendarSpan(exhausted.checked) : undefined;
  const asked = exhausted ? calendarSpan(exhausted.requested) : undefined;
  const askedLabel = asked
    ? t("dashboard.timeRange.widgetOriginallyRequested").replace("{range}", formatPeriod(asked.start, asked.end, lang))
    : "";
  const periodLabel = exhausted
    ? checked
      ? t("dashboard.timeRange.widgetChecked").replace("{range}", formatPeriod(checked.start, checked.end, lang))
      : askedLabel
    : period && !actions.periodStatedByBoard ? formatPeriod(period.start, period.end, lang) : "";
  // The window this card's binding ASKED for, when the numbers above come from
  // a wider one (RD-T-03, §18.2: both windows in every widget's provenance).
  // Only a widened card says it; the banner over the board says why. When
  // that banner already names both windows (`timeRangeStatedByBoard`, a
  // uniform board), the card does not say them again — display only: the
  // record stays on the cell.
  const widenedFrom = actions.timeRange?.state === "expanded" && !actions.timeRangeStatedByBoard
    ? actions.timeRange.requested
    : undefined;
  const requestedLabel = exhausted
    ? checked && asked && (checked.start !== asked.start || checked.end !== asked.end) ? askedLabel : ""
    : widenedFrom
      ? t("dashboard.timeRange.widgetRequested").replace(
          "{range}", formatPeriod(widenedFrom.start, widenedFrom.end, lang),
        )
      : "";
  const periodTitle = period?.compare
    ? t("dashboard.state.periodCompared").replace(
        "{period}", formatPeriod(period.compare.start, period.compare.end, lang),
      )
    : undefined;
  // The compare line: "vs previous N days" when the baseline is the N days
  // right before this card's window, else the dated text. Full dates on hover.
  const previousDays = period?.compare ? previousDaysCount(period, period.compare) : undefined;
  const compareLabel = period?.compare && !metaStated && !exhausted
    ? previousDays !== undefined
      ? t("dashboard.state.vsPreviousDays").replace("{count}", String(previousDays))
      : periodTitle
    : "";
  const freshness = useFreshnessLabel(syncedAt);
  const syncedLabel = freshness?.relative ?? "";

  // Cụm bên phải hàng tiêu đề: XUẤT XỨ rồi ĐỘ MỚI. Nguồn đứng TRƯỚC vì nó là
  // thứ duy nhất trong hai cái mà bảng không nói ở chỗ khác — chip nền tảng
  // trên header chỉ đúng cho board một nguồn, còn `templates.ts` có board trộn
  // meta_ads với tiktok_ads. `hideSynced` tắt phần thời gian; nguồn thì không
  // bao giờ tắt theo cờ đó.
  const updatedLabel = !hideSynced && !metaStated && freshness ? freshness.updated : "";

  // The producer's note rides an info icon (a tooltip), never a line under the
  // body: a line is clamped and cut on a narrow card, a tooltip holds it whole
  // and adds no height. It sits by the period line, else by the title, else in
  // the card's corner.
  const noteParts = [shownNote(note, lang), shownNote(sourceNote, lang)].filter(
    (part, i, all) => part && all.indexOf(part) === i,
  );
  const noteText = showChildren ? noteParts.join(" ") : "";
  const noteTip = noteText ? <NoteTip text={noteText} color={p.inkMuted} /> : null;
  const noteBesidePeriod = Boolean(noteTip) && showFootnote && Boolean(periodLabel);
  const noteBesideTitle = Boolean(noteTip) && !noteBesidePeriod && Boolean(title);
  const noteInCorner = Boolean(noteTip) && !noteBesidePeriod && !noteBesideTitle;
  const padding = chat ? (hero ? "px-3.5 py-3" : "px-4 py-3.5") : hero ? "px-4 py-3.5" : "px-5 py-[18px]";

  return (
    <section
      className={cn("@container relative flex h-full min-h-0 min-w-0 flex-col rounded-xl transition-shadow", padding, className)}
      style={{
        letterSpacing: tracking.body,
        border: `1px solid ${isAlert ? p.critical : p.border}`,
        background: isAlert ? p.criticalBg : (surface ?? p.bg),
        ...(accentTop && !isAlert ? { borderTop: `2px solid ${accentTop}` } : {}),
        // A per-card refresh keeps the last numbers readable (as the board
        // refresh does) and only dims them while the new read is out.
        ...(actions.refreshing ? { opacity: 0.6 } : {}),
      }}
      aria-busy={actions.refreshing || undefined}
      data-state={state}
    >
      {title || (showFootnote && (shownPlatform || sourceAccount || updatedLabel)) || state === "ok_stale" ? (
        <div
          className={cn(
            // pr-5: with the card padding, clears the "…" menu in the corner (28px at right-2).
            "flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5",
            !chat || noteInCorner ? "pr-5" : undefined,
            // Xuống dòng theo NỘI DUNG, không theo một ngưỡng bề rộng.
            //
            // Trước đây cụm meta hai vế (nguồn + độ mới, hoặc + pill stale)
            // bị ÉP xuống dòng riêng dưới mọi container < 230px. Thẻ KPI luôn
            // hẹp hơn thế (`w: 3`), nên cả hàng KPI đọc thành năm dòng trong
            // khi mọi chart cạnh nó đặt nguồn bên phải tiêu đề — trên thẻ
            // ~185px, "Tiếp cận" + "TikTok Ads · 1 giờ trước" vừa một hàng.
            //
            // `flex-wrap` với tiêu đề `basis-auto` (xem dưới) tự làm đúng việc
            // đó: hai phần vừa thì chung một hàng, không vừa thì cụm meta rớt
            // xuống hàng dưới với trọn bề ngang — tiêu đề không bao giờ bị ép
            // về 0px, vì quyết định xuống dòng dựa trên bề rộng NỘI DUNG của
            // từng phần chứ không phải phần còn thừa sau khi co.
            // A hero card's title and period line are one group (2px apart).
            subtitle || (hero && periodLabel) ? "mb-0.5" : "mb-2",
          )}
        >
          {title ? (
            // `basis-auto`, NOT `flex-1`. With a zero basis the title always
            // "fits" on the first line, so the row never wraps and the tight
            // case is settled by SHRINKING — against a `shrink-0` meta, which
            // means the title is the only thing that can give. That is how a
            // 173px KPI card printed `Cost per re…` beside a full-width
            // `TikTok Ads` (measured 2026-09-19): the widget lost its NAME to
            // keep a label repeated on every card of the board.
            //
            // Sized by its content instead, the row wraps when the two do not
            // fit and the title gets the whole width back. Nothing is
            // truncated that a second line can hold, which is the rule this
            // card was breaking: a clipped title is unrecoverable, a wrapped
            // one costs 14px.
            <h3
              className={cn("min-w-0 grow basis-auto", chat ? "break-words" : "truncate")}
              style={
                hero
                  ? { fontSize: font.title, fontWeight: weight.body, color: p.inkSecondary, letterSpacing: tracking.title }
                  : { fontSize: font.title, fontWeight: weight.title, color: p.inkPrimary, letterSpacing: tracking.title }
              }
            >
              {title}
            </h3>
          ) : null}
          {titleAside}
          {noteBesideTitle ? noteTip : null}
          {(showFootnote && (shownPlatform || sourceAccount || updatedLabel)) || state === "ok_stale" ? (
            <span
              className={cn(
                // Không `shrink-0`: khi đã rớt xuống hàng riêng, cụm được co
                // trong đúng bề ngang thẻ và pill stale xuống dòng dưới nguồn
                // thay vì tràn ra ngoài.
                "flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5",
              )}
            >
              {showFootnote && (shownPlatform || sourceAccount || updatedLabel) ? (
                // Source first, freshness second, one line. Nothing is dropped:
                // under a 230px container — a four-up KPI card — the sentence
                // form "Updated just now" no longer fits beside the platform, so
                // the same fact prints in its bare form ("just now"). Two spans
                // swapped by a container query rather than one truncated
                // string, because "TikTok Ads · Updated ju…" states neither
                // fact.
                //
                // `font.meta`, the floor: source and freshness repeat on every
                // card and say something ABOUT the numbers, not the numbers.
                <span
                  // On chat the parts wrap: a source sentence ("Snapshot trang hồ sơ…") keeps all its words.
                  className={cn("flex min-w-0 items-baseline gap-1", chat && "flex-wrap")}
                  style={{ fontSize: font.meta, fontWeight: weight.caption, color: p.inkMuted, ...tabular }}
                  // Dạng ngắn ("1 giờ trước") trên thẻ hẹp; câu đầy đủ khi rê chuột.
                  title={updatedLabel || undefined}
                >
                  {shownPlatform ? (
                    <span className={chat ? "min-w-0 [overflow-wrap:anywhere]" : "shrink-0"}>{shownPlatform}</span>
                  ) : null}
                  {/* WHOSE data, beside where it is from (RD-A-08): the name,
                      with the full name and id one press away. Only the account
                      this card was actually read from — see
                      `widgetSourceAccount`. */}
                  {sourceAccount ? (
                    <>
                      {shownPlatform ? <span aria-hidden="true">·</span> : null}
                      <AccountChip
                        dotColor={accountColorOf(boardView.accounts, sourceAccount.id) ?? accountColorAt(0)}
                        roomPx={boardView.chipRoomPx}
                        advertiserId={sourceAccount.id}
                        advertiserLabel={sourceAccount.label}
                        matchType={sourceAccount.matchType}
                        onToggleFocus={
                          boardView.mode === "compare" && boardView.toggleFocus
                            ? () => boardView.toggleFocus?.(sourceAccount.id)
                            : undefined
                        }
                        focused={boardView.focused === sourceAccount.id}
                      />
                    </>
                  ) : null}
                  {updatedLabel ? (
                    <>
                      <span className={cn("min-w-0", chat ? "[overflow-wrap:anywhere]" : "truncate", "@max-[230px]:hidden")}>
                        {shownPlatform || sourceAccount ? `· ${updatedLabel}` : updatedLabel}
                      </span>
                      <span className={cn("hidden min-w-0", chat ? "[overflow-wrap:anywhere]" : "truncate", "@max-[230px]:inline")}>
                        {shownPlatform || sourceAccount ? `· ${syncedLabel}` : syncedLabel}
                      </span>
                    </>
                  ) : null}
                </span>
              ) : null}
              {state === "ok_stale" ? (
                // Folded into the same cluster as source+freshness rather than
                // floating `absolute` over the corner: the two used to compete
                // for the exact same pixels once freshness moved up here from
                // the foot (2026-09-19) — a long platform name ran straight
                // under the pill instead of stopping short of it.
                <span
                  className="shrink-0 rounded px-1.5 py-0.5"
                  style={{ fontSize: font.caption, color: p.warning, border: `1px solid ${p.warning}` }}
                >
                  {t("dashboard.state.stale")}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {showFootnote && periodLabel ? (
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            chat && "flex-wrap",
            requestedLabel ? "mb-0" : hero ? "mb-2.5" : "mb-1",
          )}
        >
          <p
            // A hero card keeps 10px between its label group and the number. An
            // exhausted card's dates are the whole message on a narrow card: they wrap.
            className={cn("min-w-0", !exhausted && !chat && "truncate")}
            title={exhausted ? periodLabel : periodTitle}
            data-testid="widget-period"
            data-kind={exhausted ? (checked ? "checked" : "requested") : undefined}
            style={{ fontSize: font.meta, fontWeight: weight.caption, color: p.inkMuted, ...tabular }}
          >
            {periodLabel}
          </p>
          {compareLabel ? (
            <span
              className={cn("min-w-0", chat ? "break-words" : "shrink-0 truncate")}
              title={periodTitle}
              data-testid="widget-period-compare"
              style={{ fontSize: font.meta, fontWeight: weight.caption, color: p.inkMuted, ...tabular }}
            >
              {`· ${compareLabel}`}
            </span>
          ) : null}
          {noteBesidePeriod ? noteTip : null}
        </div>
      ) : null}
      {showFootnote && periodLabel && requestedLabel ? (
        <p
          className={cn(!exhausted && !chat && "truncate", hero ? "mb-2.5" : "mb-1")}
          title={requestedLabel}
          data-testid="widget-period-requested"
          style={{ fontSize: font.meta, fontWeight: weight.caption, color: p.inkMuted, ...tabular }}
        >
          {requestedLabel}
        </p>
      ) : null}
      {subtitle ? (
        // `title` for the same reason `footnoteRight` below carries one: this
        // line is truncated BY DESIGN (a second line would push every chart in
        // a row out of alignment with its neighbours), and the producer now
        // sends sentences here that state a fact the reader cannot recover from
        // the screen — "Drawn as columns, not a share: CPM is a ratio…", which
        // clips mid-reason in a half-width cell. The leading clause survives the
        // clip and carries the surprise; the tooltip carries the rest.
        <p
          className={cn(chat ? "break-words" : "truncate", dense ? "mb-1" : "mb-2")}
          style={{ fontSize: font.caption, fontWeight: weight.caption, color: p.inkMuted }}
          title={subtitle}
        >
          {subtitle}
        </p>
      ) : null}

      {showChildren ? (
        <div
          className="min-h-0 flex-1 transition-opacity duration-150 motion-reduce:transition-none"
          style={dimmedFor(boardView, sourceAccount?.id) ? { opacity: 0.35 } : undefined}
        >
          {children}
        </div>
      ) : (
        <StateBody
          state={state}
          emptyText={emptyText}
          emptyWhy={emptyWhy}
          timing={actions.timing}
          onRetry={onRetry}
          onReauthorize={onReauthorize}
          expandRange={actions.expandRange}
          editEmpty={actions.editEmpty}
          busy={actions.refreshing}
        />
      )}

      {noteInCorner ? (
        <span className="absolute right-2 top-2">{noteTip}</span>
      ) : null}

      {showFootnote && showChildren && footnoteRight ? (
        // `title` because this line is the one the shell TRUNCATES by design —
        // it is an axis note, and shortening it is better than letting it grow
        // the card. But "Indexed, 100 = 10/9 — real value…" ends mid-fact, so
        // the full sentence has to remain reachable (screenshot 2026-09-17).
        //
        // Alone on its row since 2026-09-19 (source+freshness moved up to the
        // title row), so it owns the FULL card width — no more splitting one
        // hairline into two half-width halves with source+freshness.
        <div className={cn("flex", dense ? "mt-1" : "mt-2")}>
          <span
            // WRAPS, and does not clip. This line is the last thing in the
            // card, so a second line pushes nothing out of place — while
            // `vs previous p…` and `no previous-period data to…` (measured
            // 2026-09-19 on a four-up KPI row) both end exactly where the
            // fact starts. `line-clamp-2` keeps a genuinely long axis note
            // from growing the card without bound, and `title` still carries
            // the whole sentence for the one that hits the clamp.
            className={cn(!chat && "line-clamp-2", "min-w-0 break-words")}
            style={{ fontSize: font.meta, fontWeight: weight.caption, color: p.inkMuted, ...tabular }}
            title={footnoteRight}
          >
            {footnoteRight}
          </span>
        </div>
      ) : null}
    </section>
  );
}

// The note's trigger: a focusable icon button whose accessible name is the note
// itself, with the app's hover card for sighted pointers. Hover, focus and tap
// (focus on touch) all open it.
function NoteTip({ text, color: ink }: { text: string; color: string }) {
  return (
    <HoverTooltip content={text} asChild>
      <button
        type="button"
        aria-label={text}
        data-testid="widget-note"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full"
        style={{ color: ink }}
      >
        <Info className="size-3" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </HoverTooltip>
  );
}

// One icon per state, so the four ways a card can show no figure are told apart
// at a glance and not by reading (RD-W-07). The icon never carries the meaning
// alone — every state also says it in words.
const STATE_ICON: Partial<Record<WidgetState, LucideIcon>> = {
  empty: Inbox,
  error: TriangleAlert,
  timeout: Clock,
  quota_exceeded: Hourglass,
  unauthorized: Lock,
};

function StateBody({
  state,
  emptyText,
  emptyWhy,
  timing,
  onRetry,
  onReauthorize,
  expandRange,
  editEmpty,
  busy = false,
}: {
  state: WidgetState;
  emptyText?: unknown;
  emptyWhy?: EmptyWhy;
  timing?: StateTiming;
  onRetry?: () => void;
  onReauthorize?: () => void;
  expandRange?: WidgetActions["expandRange"];
  editEmpty?: WidgetActions["editEmpty"];
  /** The card is being re-read: its actions wait for the answer. */
  busy?: boolean;
}) {
  const { t, lang } = useTranslate();
  // Since when: the moment THIS read was tried, on the board's shared clock so
  // "3 min ago" keeps moving (RD-R-05/06). Absent → the line is left out, never
  // guessed from `synced_at`, which dates the last success, not the failure.
  const checked = useFreshnessLabel(timing?.checkedAt);

  if (state === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-2" aria-busy="true">
        <div className="h-24 w-full animate-pulse rounded" style={{ background: color.grid }} />
        <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: color.grid }} />
      </div>
    );
  }

  const Icon = STATE_ICON[state];
  if (!Icon) return null;

  const caption = { fontSize: font.caption, color: color.inkMuted, ...tabular };
  const checkedLine = checked ? (
    <span style={caption}>{t("dashboard.state.checkedAt").replace("{time}", checked.relative)}</span>
  ) : null;

  let title: string;
  let detail: ReactNode = null;
  let action: ReactNode = null;
  let iconColor: string = color.inkMuted;

  if (state === "empty") {
    title = missingCauseText(emptyWhy?.cause, lang) || shownNote(emptyText, lang) || t("dashboard.state.empty");
    const note = emptyNoteText(emptyWhy, lang);
    const noteLine = note ? (
      <span className="line-clamp-2" style={{ fontSize: font.caption, color: color.inkMuted }} title={note}>
        {note}
      </span>
    ) : null;
    // Beside the sentence, never instead of it (BUG-119.1-RD-R-08): the panel
    // decided this card's window may be widened, or that it has been as far as
    // it may go — the shell only says which. A note and the ceiling are both
    // said.
    const limitLine = expandRange?.kind === "limit" ? (
      <span data-testid="widget-expand-range-limit" style={{ fontSize: font.caption, color: color.inkMuted }}>
        {t("dashboard.state.expandRangeLimit").replace("{n}", String(expandRange.days))}
      </span>
    ) : null;
    // Another period MAY bring a metric the source left out of its rows; the
    // reader is told it may not, before they spend a read on it.
    const changeRangeNote = editEmpty?.field === "range" ? (
      <span
        data-testid="widget-change-range-note"
        className="line-clamp-2"
        style={{ fontSize: font.caption, color: color.inkMuted }}
        title={t("dashboard.state.changeRangeNote")}
      >
        {t("dashboard.state.changeRangeNote")}
      </span>
    ) : null;
    detail = noteLine || limitLine || changeRangeNote ? <>{noteLine}{limitLine}{changeRangeNote}</> : null;
    if (editEmpty) {
      const range = editEmpty.field === "range";
      action = (
        <button
          type="button"
          data-testid={range ? "widget-change-range" : "widget-change-metric"}
          onClick={(event) => editEmpty.onEdit(event.currentTarget)}
          disabled={busy}
          aria-busy={busy || undefined}
          className="shrink-0 rounded border px-2.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          style={{ borderColor: color.border, color: color.inkPrimary, fontSize: font.body }}
        >
          {t(range ? "dashboard.state.changeRange" : "dashboard.state.changeMetric")}
        </button>
      );
    }
    if (expandRange?.kind === "expand") {
      action = (
        <button
          type="button"
          data-testid="widget-expand-range"
          onClick={expandRange.onExpand}
          className="rounded border px-2.5 py-0.5"
          style={{ borderColor: color.border, color: color.inkPrimary, fontSize: font.body }}
        >
          {t("dashboard.state.expandRange").replace("{n}", String(expandRange.days))}
        </button>
      );
    }
  } else if (state === "error" || state === "timeout") {
    title = state === "timeout" ? t("dashboard.state.timeout") : t("dashboard.state.error");
    iconColor = color.stale;
    detail = checkedLine;
    action = onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="rounded border px-2.5 py-0.5"
        style={{ borderColor: color.border, color: color.inkPrimary, fontSize: font.body }}
      >
        {t("dashboard.state.retry")}
      </button>
    ) : null;
  } else if (state === "quota_exceeded") {
    title = t("dashboard.state.quotaTitle");
    iconColor = color.stale;
    // No retry button: another read inside the limit is refused again (W1).
    // The time is the producer's own wait counted from this read; without both
    // halves the card says "later" rather than print a placeholder dash.
    const at = timing ? retryAt(timing) : null;
    detail = (
      <span style={caption}>
        {at
          ? t("dashboard.state.quotaRetryAt").replace("{time}", clockTime(at))
          : t("dashboard.state.quotaRetryLater")}
      </span>
    );
  } else {
    title = t("dashboard.state.unauthorizedTitle");
    iconColor = color.inkPrimary;
    detail = checkedLine;
    action = onReauthorize ? (
      <button
        type="button"
        onClick={onReauthorize}
        className="rounded px-2.5 py-0.5"
        // Nền là inkPrimary (đảo theo theme) nên chữ phải lấy nền widget,
        // KHÔNG dùng text-white — ở dark mode sẽ thành trắng trên trắng.
        style={{ background: color.inkPrimary, color: color.bg, fontSize: font.body }}
      >
        {t("dashboard.state.reauthorize")}
      </button>
    ) : null;
  }

  // TWO rows, not four: icon beside the title, then "since when" beside the
  // action. Stacked one per line (icon / title / time / button) the body needed
  // ~120px and a half-height card clipped the button at its bottom edge
  // (screenshot 2026-09-24). `min-h-0` keeps a card shorter still from pushing
  // the body out of its frame; on a card too short even for two rows the body
  // scrolls from its top (`justify-center-safe`) rather than clip the action
  // off its bottom edge.
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-1 overflow-y-auto overflow-x-hidden py-2 text-center"
      data-state-body={state}
    >
      <div className="flex max-w-full items-center justify-center gap-1.5">
        <Icon className="size-4 shrink-0" style={{ color: iconColor }} strokeWidth={1.75} aria-hidden="true" />
        <span style={{ fontSize: font.body, color: state === "empty" ? color.inkMuted : color.inkPrimary }}>{title}</span>
      </div>
      {detail || action ? (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {detail}
          {action}
        </div>
      ) : null}
    </div>
  );
}
