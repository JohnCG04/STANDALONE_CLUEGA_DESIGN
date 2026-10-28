// Engine bố cục RWD (PRD §3.7 / §7.9): cùng JSON ánh xạ, sắp lại theo breakpoint.
import type { WidgetSlot, WidgetType } from "@/components/dashboard/widgets/types";

export type GridCols = 12 | 6 | 1;

// Số cột 1 widget chiếm ở lưới hiện tại (clamp theo tổng cột).
export function spanForColumns(layoutW: number, cols: GridCols): number {
  if (cols === 1) return 1;
  const scaled = Math.round((layoutW / 12) * cols);
  return Math.max(1, Math.min(cols, scaled));
}

// Sắp xếp slot theo (y, x, slot_id) để render deterministically vào CSS grid.
/**
 * Shapes the product no longer draws, dropped out of every board that reaches
 * the screen — including the ones already SAVED with one in them.
 *
 * `metric_strip` was retired on 2026-09-18. It was the band of account figures
 * that did not earn a KPI card, and at 37 items it read as a wall of numbers
 * rather than as an answer.
 *
 * Dropped here rather than answered in `WidgetRenderer`, whose `default` branch
 * is an ERROR shell: a board saved last week would have grown a red cell naming
 * a widget the reader never chose and cannot remove. Dropped rather than
 * rendered as null, too — a null cell still holds its grid rows, so the board
 * would carry a hole the size of a full-width band.
 *
 * `orderSlots` is the one gateway every board goes through: `arrangeSlots`
 * calls it, and the three surfaces that lay a board out themselves
 * (`DashboardPanel`, `DashboardBlockView`, `TemplateBoardMiniature`) each call
 * it directly. One filter here reaches all four.
 */
const RETIRED_WIDGETS: ReadonlySet<string> = new Set(["metric_strip"]);

export function orderSlots<C>(slots: WidgetSlot<C>[]): WidgetSlot<C>[] {
  return [...slots]
    .filter((slot) => !RETIRED_WIDGETS.has(String(slot.widget)))
    .sort(
    (a, b) =>
      a.layout.y - b.layout.y ||
      a.layout.x - b.layout.x ||
      a.slot_id.localeCompare(b.slot_id),
  );
}

export interface WidgetPlacement<C = unknown> {
  slot: WidgetSlot<C>;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
}


function placementOverlaps(
  a: Pick<WidgetPlacement, "columnStart" | "columnSpan" | "rowStart" | "rowSpan">,
  b: Pick<WidgetPlacement, "columnStart" | "columnSpan" | "rowStart" | "rowSpan">,
): boolean {
  return (
    a.columnStart < b.columnStart + b.columnSpan &&
    b.columnStart < a.columnStart + a.columnSpan &&
    a.rowStart < b.rowStart + b.rowSpan &&
    b.rowStart < a.rowStart + a.rowSpan
  );
}

function findAvailablePlacement(
  placed: WidgetPlacement[],
  columns: GridCols,
  preferredColumn: number,
  preferredRow: number,
  columnSpan: number,
  rowSpan: number,
): Pick<WidgetPlacement, "columnStart" | "rowStart"> {
  const lastColumn = columns - columnSpan + 1;
  for (let rowStart = preferredRow; ; rowStart += 1) {
    const firstColumn = rowStart === preferredRow ? preferredColumn : 1;
    for (let columnStart = firstColumn; columnStart <= lastColumn; columnStart += 1) {
      const candidate = { columnStart, columnSpan, rowStart, rowSpan };
      if (!placed.some((placement) => placementOverlaps(candidate, placement))) {
        return { columnStart, rowStart };
      }
    }
  }
}

/**
 * Chiếu một mapping canonical 12 cột sang lưới hiển thị hiện tại.
 *
 * Desktop dùng chính xác toạ độ canonical. Tablet/mobile scale span và x, sau
 * đó pack theo (y, x, slot_id) để loại va chạm do làm tròn. Hàm chỉ tạo
 * placement render; tuyệt đối không sửa `slot.layout`.
 */
export function arrangeSlots<C>(
  slots: WidgetSlot<C>[],
  columns: GridCols,
): WidgetPlacement<C>[] {
  const ordered = orderSlots(slots);
  if (columns === 12) {
    return ordered.map((slot) => ({
      slot,
      columnStart: Math.max(1, Math.floor(slot.layout.x + 1)),
      columnSpan: spanForColumns(declaredSpan(slot) ?? slot.layout.w, columns),
      rowStart: Math.max(1, Math.floor(slot.layout.y + 1)),
      rowSpan: Math.max(1, Math.floor(slot.layout.h)),
    }));
  }

  const placed: WidgetPlacement<C>[] = [];
  for (const slot of ordered) {
    const columnSpan = spanForColumns(declaredSpan(slot) ?? slot.layout.w, columns);
    const rowSpan = Math.max(1, Math.floor(slot.layout.h));
    const preferredColumn = Math.min(
      columns - columnSpan + 1,
      Math.max(1, Math.floor(Math.round((slot.layout.x / 12) * columns) + 1)),
    );
    const preferredRow = Math.max(1, Math.floor(slot.layout.y + 1));
    const position = findAvailablePlacement(
      placed,
      columns,
      preferredColumn,
      preferredRow,
      columnSpan,
      rowSpan,
    );
    placed.push({ slot, columnSpan, rowSpan, ...position });
  }
  return placed;
}

/**
 * Di chuyển một widget qua widget đích rồi pack lại canonical grid 12 cột.
 * Kích thước `w/h` và mọi dữ liệu widget được giữ nguyên; chỉ `x/y` thay đổi.
 * Kéo xuống một slot đặt widget sau slot đích, kéo lên đặt trước slot đích.
 */
export function reorderSlots<C>(
  slots: WidgetSlot<C>[],
  movedSlotId: string,
  targetSlotId: string,
): WidgetSlot<C>[] {
  if (movedSlotId === targetSlotId) return slots;

  const ordered = orderSlots(slots);
  const movedIndex = ordered.findIndex((slot) => slot.slot_id === movedSlotId);
  const targetIndex = ordered.findIndex((slot) => slot.slot_id === targetSlotId);
  if (movedIndex < 0 || targetIndex < 0) return slots;

  const [moved] = ordered.splice(movedIndex, 1);
  const remainingTargetIndex = ordered.findIndex((slot) => slot.slot_id === targetSlotId);
  const insertAt = movedIndex < targetIndex ? remainingTargetIndex + 1 : remainingTargetIndex;
  ordered.splice(insertAt, 0, moved);

  // Placement walks a cursor forward instead of restarting the search at the
  // top-left for every slot.
  //
  // Restarting let a later slot drop into an earlier hole, which quietly undid
  // the move this function had just been asked to make. Drag a 4-wide pie chart
  // below a 12-wide table: the array order changes, then the packer finds the
  // 4 free columns beside the 8-wide line chart above and puts the pie straight
  // back there. x/y is what the panel sorts by (orderSlots), so the board came
  // out exactly as it went in and the drag looked like it had done nothing.
  //
  // The holes cost nothing to leave: the panel lays out by SPAN through
  // assignSpans, so these coordinates are only ever read as an ordering.
  const placed: WidgetPlacement<C>[] = [];
  let cursorColumn = 1;
  let cursorRow = 1;
  return ordered.map((slot) => {
    const columnSpan = spanForColumns(slot.layout.w, 12);
    const rowSpan = Math.max(1, Math.floor(slot.layout.h));
    const position = findAvailablePlacement(
      placed,
      12,
      cursorColumn,
      cursorRow,
      columnSpan,
      rowSpan,
    );
    cursorRow = position.rowStart;
    cursorColumn = position.columnStart + columnSpan;
    const nextSlot = {
      ...slot,
      layout: {
        ...slot.layout,
        x: position.columnStart - 1,
        y: position.rowStart - 1,
      },
    };
    placed.push({ slot: nextSlot, columnSpan, rowSpan, ...position });
    return nextSlot;
  });
}

/**
 * Applies a server-provided slot replacement without discarding a panel-local
 * drag position. The server owns every field except `layout.x` / `layout.y`;
 * the panel owns those coordinates until dashboard mapping persistence exists.
 *
 * A kept `x` was placed for the CURRENT width, and the replacement may be
 * wider (an undo puts a half-width card back at full width). It is pulled left
 * just enough for the incoming width to fit the 12-column grid: x 6 under w 12
 * was stored as x + w = 18, and the backend refused every later write of the
 * board until a chat turn renumbered the slot.
 */
export function rebindSlotsPreservingPositions<C>(
  current: WidgetSlot<C>[],
  incoming: WidgetSlot<C>[],
): WidgetSlot<C>[] {
  const positions = new Map(
    current.map(({ slot_id, layout }) => [slot_id, { x: layout.x, y: layout.y }]),
  );

  return incoming.map((slot) => {
    const kept = positions.get(slot.slot_id);
    const position = kept && {
      x: Math.max(0, Math.min(kept.x, PANEL_GRID_COLS - slot.layout.w)),
      y: kept.y,
    };
    if (!position || (position.x === slot.layout.x && position.y === slot.layout.y)) {
      return slot;
    }
    return {
      ...slot,
      layout: { ...slot.layout, ...position },
    };
  });
}

// ── Lưới trong panel ────────────────────────────────────────────────────────
// Panel KHÔNG dùng breakpoint viewport (§7.9 dành cho trang chia sẻ). Giữ 12 cột
// để đúng ngữ nghĩa layout.w, nhưng span do BỀ RỘNG TỐI THIỂU TỪNG LOẠI quyết
// định — một ngưỡng dùng chung cho cả 11 widget chính là lỗi của vòng trước.
export const PANEL_GRID_COLS = 12;
export const PANEL_GRID_GAP_PX = 12; // khớp gap-3 của grid

interface GridRule {
  /** Bề rộng nhỏ nhất còn đọc được, đo từ nội dung thật của widget. */
  minPx: number;
  /** Trần số widget mỗi hàng, kể cả khi còn thừa chỗ. */
  maxPerRow: number;
  /** Sàn số widget mỗi hàng — chống 1-thẻ-mỗi-hàng ở panel hẹp nhất. */
  minPerRow: number;
}

export const GRID_RULES: Record<WidgetType, GridRule> = {
  // 156px: the width a KPI card still prints its value at without clipping —
  // the delta badge sits on its own line UNDER the value, so only the number
  // has to fit (KpiCard steps it 28 → 24 → 20px as its own container narrows).
  // Sized off the RAIL, which is where these cards actually live: a panel is
  // `panel − 2px border − px-3` of grid, so the default 720px panel gives 694px
  // and a half-screen drag on a 1500px window gives ~774px. 4 × 156 + 3 × 12
  // gaps = 660 clears both with room to spare — the old 240px floor needed
  // 996px of grid, wider than the whole rail ever gets next to the chat
  // column, so a 2×2 block was all it ever showed.
  // Up to 6 cards share ONE row when width allows (6 × 156 + 5 × 12 = 996px of
  // grid); the 156px floor still applies, so a narrow panel keeps fewer per row.
  kpi_card:       { minPx: 156, maxPerRow: 6, minPerRow: 2 },
  //
  // Every floor below is the width its OWN content stops being readable at,
  // measured widget by widget at 240/280/300/340/380/420/480/560px (harness
  // 2026-09-03, each widget rendered through WidgetRenderer in a 244px-tall
  // cell, counting elements whose scrollWidth exceeds clientWidth). They were
  // one blanket 420/560 pair before, sized for the 1280px page canvas — in the
  // rail that meant KPI cards went four-up at 660px while every chart stayed
  // full width to 852px+, which is the imbalance this pass fixes.
  //
  // 320. The floor is a WIDTH BUDGET, and the rail's own ceiling is what it has
  // to fit inside: on a 1568px window with the sidebar open the row is ~1320px
  // and the panel may take row − 620 (the chat's floor) ≈ 700px, i.e. ~684px of
  // grid. A 6/6 pair there is 336px per half — so any floor above that means
  // line and pie can NEVER share a row in the rail, whatever the user drags.
  // 380 was exactly that, which is what was reported. PieChart's donut and
  // legend were resized to hold at 320 (160px donut + basis-36 legend + 16 gap,
  // see the comment there).
  //
  // THE 32 PIXELS THIS NUMBER FORGOT, found 2026-09-18. That 320 is the row's
  // INNER budget, but every floor here is compared against `spanPx` — the GRID
  // CELL — and `WidgetShell` spends `p-4` (32px) of the cell before its body
  // sees any of it. So a cell at exactly the floor hands the donut 288, and a
  // 6/12 cell on a 700px panel hands it 310: the row could never form at the
  // floor it was given, and the old note here ("at 320-340 the legend WRAPS …
  // and that is fine") was describing a permanent state as an edge case. It is
  // not fine on a short card — the wrapped pair outgrows the body and
  // `overflow-hidden` eats the top of the ring and half the legend.
  //
  // The NUMBER is unchanged, deliberately. Raising it to 352 would buy the
  // full-width donut back and cost the line+donut pair the rail exists to form
  // (342 < 352 at 700px, the very case the paragraph above protects). The fix
  // went into the widget instead: the donut now SHRINKS so the row survives a
  // narrow cell, so 310 inner draws a 150px ring beside a full legend rather
  // than a clipped stack. Before moving this number, read PieChart's own
  // comment — the two are one decision.
  pie_chart:      { minPx: 320, maxPerRow: 2, minPerRow: 1 },
  // 320: same budget, same reason — a funnel beside a chart is the other pair
  // the rail has to be able to form, and a stage label that falls outside its
  // bar (see Funnel's labelInside rule) still has room beside it at 320.
  funnel:         { minPx: 320, maxPerRow: 2, minPerRow: 1 },
  // 320, from 420 → 340 → here: the y-axis ticks arrived and PAD_R dropped
  // 96 → 16, and Chart.js thins the date ticks to the axis width, so the plot
  // reads at 320 with four x labels and three y labels.
  line_chart:     { minPx: 320, maxPerRow: 2, minPerRow: 1 },
  // 380, down from 420: category labels middle-truncate to fit their own column
  // (BarChart's axisMaxChars), and below 380 five campaign names collapse to
  // "Su…st" — head and tail stop telling two ads apart.
  bar_chart:      { minPx: 380, maxPerRow: 2, minPerRow: 1 },
  // 460, down from 560: four columns (name + 3 metrics) are clean from 300px;
  // 460 keeps the same headroom for the 6-column ceiling the producer allows.
  table:          { minPx: 460, maxPerRow: 2, minPerRow: 1 },
  section_header: { minPx: 0,   maxPerRow: 1, minPerRow: 1 },
  // 280: gauge ring + centre percentage scale with the cell; nothing clips.
  goal_gauge:       { minPx: 280, maxPerRow: 4, minPerRow: 1 },
  // 280: rank + label + value + bar, labels truncate cleanly from 280 up.
  ranking:          { minPx: 280, maxPerRow: 2, minPerRow: 1 },
  // 420 unchanged: axis labels on BOTH axes plus quadrant and reference-line
  // captions — the only widget that spends width on four corner labels.
  scatter_bubble:   { minPx: 420, maxPerRow: 2, minPerRow: 1 },
  media_card:       { minPx: 150, maxPerRow: 6, minPerRow: 2 },
  live_status_bar:  { minPx: 0,   maxPerRow: 1, minPerRow: 1 },
  note:             { minPx: 280, maxPerRow: 2, minPerRow: 1 },
  // Eight time bands plus the day gutter: under ~420px the columns stop
  // being readable and the grid scrolls sideways instead of laying out.
  heatmap:          { minPx: 420, maxPerRow: 2, minPerRow: 1 },
  // The three report shapes, each measured from what it has to print:
  // a stacked bar plus four labelled rows; an integration name beside its state
  // with two figures under it; three grouped share lists side by side.
  distribution:     { minPx: 260, maxPerRow: 2, minPerRow: 1 },
  status_list:      { minPx: 260, maxPerRow: 2, minPerRow: 1 },
  audience_summary: { minPx: 260, maxPerRow: 2, minPerRow: 1 },
  // Eight readings on one line: below ~460px they wrap into an unreadable
  // block, which is the shape this widget exists to avoid.
  // Three funnel chains side by side, each needing its stage labels.
  funnel_modes:     { minPx: 460, maxPerRow: 1, minPerRow: 1 },
};

/**
 * The grid rule of a slot's widget. A type this FE has no rule for — the
 * Dashboard MCP's own shapes (`waterfall`, `dumbbell`, `treemap`, `combo`,
 * `geo_map`) on a board saved through the MCP — takes the KPI card's, so the
 * board still lays out and WidgetRenderer draws that cell's error shell instead
 * of the whole screen failing on `undefined.minPx`.
 */
function gridRule(widget: WidgetType): GridRule {
  return GRID_RULES[widget] ?? GRID_RULES.kpi_card;
}

// Chỉ các ước của 12 → hàng luôn lấp kín, không còn khoảng hở cuối hàng.
const PER_ROW_OPTIONS = [6, 4, 3, 2, 1] as const;

// layout.w vẫn có tiếng nói: nó là TRẦN, không phải tỷ lệ co giãn.
function capFromLayoutW(layoutW: number): number {
  if (layoutW > 6) return 1;
  if (layoutW > 3) return 2;
  return 6;
}

/** Số widget cùng loại xếp được trên một hàng ở bề rộng này. */
export function slotsPerRow(widget: WidgetType, layoutW: number, width: number): number {
  const rule = gridRule(widget);
  const cap = Math.min(rule.maxPerRow, capFromLayoutW(layoutW));
  const floor = Math.min(rule.minPerRow, cap);

  for (const perRow of PER_ROW_OPTIONS) {
    if (perRow > cap || perRow < floor) continue;
    const columnPx = (width - PANEL_GRID_GAP_PX * (perRow - 1)) / perRow;
    if (columnPx >= rule.minPx) return perRow;
  }
  // Không mức nào đạt minPx → dùng sàn (panel hẹp nhất vẫn 2 thẻ KPI mỗi hàng).
  return floor;
}

/** Số cột (trên 12) một slot chiếm. */
export function slotSpan(widget: WidgetType, layoutW: number, width: number): number {
  return PANEL_GRID_COLS / slotsPerRow(widget, layoutW, width);
}

// ── Xếp hàng tham lam ───────────────────────────────────────────────────────
// Ảnh §4.1: biểu đồ đường ~8/12, donut ~3-4/12 — KHÔNG phải hai nửa bằng nhau.
// Cần biết các slot kế tiếp nên đây là hàm chạy trên CẢ danh sách, không phải
// từng slot. 8/4, 6/6, 4/4/4 và 12 không còn là bốn luật riêng: chúng là bốn
// KẾT QUẢ của cùng một phép thử "mọi item trong hàng có còn đạt sàn riêng
// không". Không còn ngưỡng bề rộng cứng nào — GRID_RULES[].minPx là nguồn duy
// nhất của mọi ngưỡng trong panel.
const DOMINANT = new Set<WidgetType>(["line_chart", "bar_chart", "table", "scatter_bubble"]);
const COMPANION = new Set<WidgetType>([
  "pie_chart", "funnel", "ranking", "distribution", "status_list", "audience_summary",
]);
// Loại "gọn": vẫn xếp đồng nhất theo luật sàn riêng, không tham gia xếp hàng.
// media_card lấp lưới tường nội dung (6 thẻ/hàng), goal_gauge như thẻ KPI.
const COMPACT = new Set<WidgetType>(["kpi_card", "goal_gauge", "media_card"]);

/** Bề rộng thực của một item span s trên lưới 12 cột, gap 12px. */
function spanPx(span: number, width: number): number {
  const colUnit = (width - PANEL_GRID_GAP_PX * (PANEL_GRID_COLS - 1)) / PANEL_GRID_COLS;
  return span * colUnit + (span - 1) * PANEL_GRID_GAP_PX;
}

/**
 * Cách chia 12 cột cho n widget, theo THỨ TỰ ƯU TIÊN.
 *
 * Hai widget: chia ĐỀU trước, 8/4 (bố cục §4.1: đường ~8/12, donut ~3-4/12) là
 * phương án dự phòng — ngược với thứ tự cũ, và có lý do đo được.
 *
 * Từ khi mỗi sàn được đo theo NỘI DUNG THẬT của từng loại, 4 cột không đủ cho
 * donut (380px, dưới mức đó legend rời khỏi cạnh donut và bị cắt) tới khoảng
 * 1164px lưới, trong khi 6 cột đủ cho CẢ đường VÀ donut từ 772px. Thử 8/4 trước
 * nên có hai hệ quả sai, cả hai đều đã được báo:
 *   1. ở lưới ~870px hai biểu đồ xếp thành hai hàng dọc dù chúng vừa một hàng;
 *   2. nếu vẫn ưu tiên 8/4, thì đúng lúc nó bắt đầu vừa (1164px) donut TỤT từ
 *      576px xuống 380px — kéo panel RỘNG ra mà một widget hẹp lại, đúng kiểu
 *      nhảy giật đã sửa cho line chart.
 * Chia đều trước loại bỏ cả hai: bề rộng mỗi widget chỉ tăng theo panel.
 *
 * 8/4 vẫn còn đường dùng, và không phải lý thuyết: khi widget vai chính có sàn
 * LỚN HƠN nửa hàng mà widget đi kèm thì không (bảng 460 + ranking 280 ở lưới
 * 864-931px), chia đều không vừa nhưng 8/4 vừa.
 */
function splitOptions(run: WidgetSlot[]): number[][] {
  if (run.length === 1) return [[PANEL_GRID_COLS]];
  if (run.length === 2) {
    const [a, b] = run;
    const even = [6, 6];
    if (DOMINANT.has(a.widget) && COMPANION.has(b.widget)) return [even, [8, 4]];
    if (COMPANION.has(a.widget) && DOMINANT.has(b.widget)) return [even, [4, 8]];
    return [even];
  }
  return [run.map(() => PANEL_GRID_COLS / run.length)];
}

/**
 * The pairing a slot DECLARES, or "" when it declares none.
 *
 * `presentation` used to carry this, and it should not have: a colour scheme is
 * not a statement about column widths, and reading one as the other meant every
 * report chart silently changed how it packed. A layout role says the thing
 * itself — "I lead this row, the next slot explains me" — and a board that says
 * nothing packs exactly as it always did.
 */
function layoutRole(slot: WidgetSlot): string {
  const c = slot.config as { layout_role?: string } | undefined;
  return c?.layout_role ?? "";
}

/**
 * An 8/4 pair, when both halves still clear their own floor.
 *
 * Returns the spans, or `null` when the pair cannot be honoured at this width —
 * the caller then falls back to the ordinary packing, which will stack them.
 * Tried in order: 8/4 as declared, then an even 6/6 (still one row, still both
 * on screen), then nothing.
 */
function pairSpans(a: WidgetSlot, b: WidgetSlot, width: number, declared: [number, number]): number[] | null {
  const floorA = gridRule(a.widget).minPx;
  const floorB = gridRule(b.widget).minPx;
  for (const [spanA, spanB] of [declared, [6, 6]]) {
    if (spanPx(spanA, width) >= floorA && spanPx(spanB, width) >= floorB) return [spanA, spanB];
  }
  return null;
}

/**
 * A row shared by ONE compact tile and its neighbour: the tile keeps its own
 * tile width and the neighbour absorbs the rest of the twelve.
 *
 * An even split would be wrong here in a way it is not for two charts. A KPI
 * card or a gauge is a tile — its width is decided by what it prints, not by
 * how much room is going spare — so half a row of a 1200px panel is ~494px of
 * card around one number, which is the whitespace this pass exists to remove.
 * The neighbour is the one that can use the width.
 *
 * Returns null when either side would fall under its own floor, and the
 * ordinary even/8-4 split is then tried as before.
 */
function compactPair(run: WidgetSlot[], width: number): number[] | null {
  if (run.length < 2) return null;
  const [a, b] = run;
  const compactFirst = COMPACT.has(a.widget);
  if (compactFirst === COMPACT.has(b.widget)) return null;
  const tileSlot = compactFirst ? a : b;
  const other = compactFirst ? b : a;
  const tile = slotSpan(tileSlot.widget, tileSlot.layout.w, width);
  const rest = PANEL_GRID_COLS - tile;
  if (tile < 2 || rest < 2) return null;
  if (spanPx(tile, width) < gridRule(tileSlot.widget).minPx) return null;
  if (spanPx(rest, width) < gridRule(other.widget).minPx) return null;
  return compactFirst ? [tile, rest] : [rest, tile];
}

/**
 * Tham lam: thử xếp 3, rồi 2 — nhận cấu hình đầu tiên mà MỌI item còn đạt sàn
 * riêng, xét lần lượt từng cách chia của số lượng đó (xem splitOptions). Không
 * cấu hình nào đạt thì item đầu chiếm cả hàng (nửa hàng trống đọc như lỗi).
 * Trả về span cho đúng số item nó tiêu thụ.
 */
function packRow(run: WidgetSlot[], width: number): number[] {
  // A tile with nobody to share with keeps its tile width. Stretching one KPI
  // card or one gauge across twelve columns is a bigger hole than the columns
  // it fills, and it is what this branch protects against now that a lone
  // compact slot reaches the packer at all.
  if (run.length === 1 && COMPACT.has(run[0].widget)) {
    return [slotSpan(run[0].widget, run[0].layout.w, width)];
  }
  // A tile beside a chart is not two charts: it keeps its tile width first.
  const tilePair = compactPair(run, width);
  if (tilePair) return tilePair;
  for (const n of [3, 2]) {
    if (run.length < n) continue;
    const candidate = run.slice(0, n);
    for (const spans of splitOptions(candidate)) {
      const fits = candidate.every(
        (s, i) => spanPx(spans[i], width) >= gridRule(s.widget).minPx,
      );
      if (fits) return spans;
    }
  }
  return [PANEL_GRID_COLS];
}

/**
 * Span cho từng slot theo thứ tự đã sắp (orderSlots). Widget "gọn" giữ luật sàn
 * đồng nhất của loại; section_header (và mọi loại chưa phân vai) chiếm cả hàng;
 * còn lại đi qua packRow theo từng dải liền kề. Bảo đảm mọi hàng đầy đủ cộng
 * đúng 12. ĐỐI XỨNG: chỉ vai trò quyết định 8/4, nên thứ tự backend trả về
 * không làm đổi kết quả.
 */
/**
 * A widget that asked to be drawn as a report and must own its row.
 *
 * A table of seven numeric columns is the widest thing a board carries. The
 * packer only asks whether each cell clears the widget's `minPx`, so at a wide
 * viewport it happily put the chart, the pie AND the table on one row at 4/4/4
 * — the table then scrolled sideways with a third of the screen while two
 * charts sat beside it. That is a presentation fault, so the presentation is
 * what fixes it, and only for the board that opted in: every other table packs
 * exactly as it did.
 */
/** Tiles per row that twelve columns divide evenly. */
const TILE_ROW_SIZES = [6, 4, 3, 2, 1] as const;

/**
 * Spans for a band of `count` tiles split into rows that each add up to twelve.
 *
 * The widest row the width allows (at most `cap` tiles) sets the number of rows;
 * the tiles are then dealt out as evenly as twelve allows, wider rows first.
 * Five tiles at 694px are 3 + 2 (`4,4,4 | 6,6`) and seven are 4 + 3, where a
 * divisor-only rule had no answer for five and drew every card a full row wide
 * (2026-10-03, a five-card brand-coverage band). Every count twelve already
 * divides comes out exactly as before. `null` when no row size clears the
 * widget's floor at this width, so the caller keeps its own fallback.
 */
function balancedTileSpans(widget: WidgetType, count: number, width: number, cap: number): number[] | null {
  const rule = gridRule(widget);
  const fits = (perRow: number) => (width - PANEL_GRID_GAP_PX * (perRow - 1)) / perRow >= rule.minPx;
  for (const perRow of TILE_ROW_SIZES) {
    if (perRow > cap || !fits(perRow)) continue;
    const rows = Math.ceil(count / perRow);
    const base = Math.floor(count / rows);
    const sizes = Array.from({ length: rows }, (_, r) => base + (r < count % rows ? 1 : 0));
    if (!sizes.every((k) => PANEL_GRID_COLS % k === 0 && fits(k))) continue;
    return sizes.flatMap((k) => Array<number>(k).fill(PANEL_GRID_COLS / k));
  }
  return null;
}

/**
 * Spans for a GROUP of `count` equal tiles that must tile the row exactly.
 *
 * `slotSpan` picks the largest per-row that clears the widget's minPx and stops
 * there — it has no idea how many tiles are in the group. Six KPI tiles at
 * span 3 is 18 columns: a full row and a half-empty one, and the widgets after
 * it then pack into the gap. Every row of a ranked band has to add up to
 * twelve (`balancedTileSpans`); one tile per row only when nothing else fits.
 */
function tiledSpans(widget: WidgetType, count: number, width: number): number[] {
  return balancedTileSpans(widget, count, width, 6) ?? Array<number>(count).fill(PANEL_GRID_COLS);
}

/**
 * A media tile that asked for the report treatment, so a WALL of them tiles the
 * row exactly instead of leaving a hole.
 */
function isReportMedia(slot: WidgetSlot): boolean {
  if (slot.widget !== "media_card") return false;
  const c = slot.config as { presentation?: string } | undefined;
  return c?.presentation === "command_center";
}

/**
 * Whether a KPI tile declares a rank at all.
 *
 * Read off the config for the same reason `ownsItsRow` is: the engine knows
 * nothing about templates, and a band that declares no rank must lay out
 * exactly as it always did.
 *
 * The rank itself is NOT what groups the band. Tiling by rank split a six-tile
 * band into a row of four primaries and a row of two secondaries, so the
 * headline of a report sat on two lines with half a row of air under it. The
 * approved deck puts all six side by side on a wide desktop, and `tiledSpans`
 * can only do that if it is handed all six. Rank still decides how loudly each
 * tile is DRAWN — that is KpiCard's business, not the grid's.
 */
function isRankedKpi(slot: WidgetSlot): boolean {
  if (slot.widget !== "kpi_card") return false;
  const c = slot.config as { emphasis?: string } | undefined;
  return Boolean(c?.emphasis);
}

/**
 * A goal gauge that asked for the report treatment, so a ROW of them tiles
 * exactly instead of leaving a hole.
 *
 * `slotSpan` sizes a gauge on its own and caps it at two per row, which is
 * right for the boards that carry one. The deck's operational band is three,
 * and three half-rows is a row and a half. Opt-in, by the same config flag the
 * table and the creative wall already read.
 */
/**
 * The widths a run of cards declares for itself, when every one of them does,
 * they add to twelve, and each still clears its own floor at this width.
 *
 * `null` otherwise — the caller then tiles the run evenly, which is the only
 * safe fallback: a partially declared row would leave a hole, and a declared
 * row at a narrow panel would squeeze a card under its minimum.
 */
/**
 * The width a slot claims for itself — or `undefined` if it claims nothing the
 * grid could honour.
 *
 * VALIDATED, not merely typed. This value ends up in `gridColumn: span N`, and
 * `assignSpans` reaches production dashboards and the public share page, so a
 * config that arrives with `8.5`, `0`, `-3`, `13`, `NaN` or `Infinity` must not
 * reach CSS. A fractional span silently changes every other column's width; a
 * zero or negative one produces a declaration the browser drops; anything over
 * twelve overflows the grid.
 *
 * Rejecting is not throwing: an invalid claim reads as "no claim", and the run
 * falls back to the packing it has always had.
 */
function declaredSpan(slot: WidgetSlot): number | undefined {
  const raw = (slot.config as { layout_span?: unknown } | undefined)?.layout_span;
  if (typeof raw !== "number") return undefined;
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) return undefined;
  if (raw < 1 || raw > PANEL_GRID_COLS) return undefined;
  return raw;
}

/**
 * A module's MANUAL size, set by the reader's resize (BUG-122-RD-N-01):
 * `config.manual_size = { span?, height? }`, stored in the definition.
 *
 * It wins over every automatic rule for THAT module — the declared row, the
 * pair, the band, the packer, the hole-closing — and only for that module: a
 * board with no manual size goes through exactly the path it always did.
 *
 * Validated like `layout_span`, because it reaches CSS on production boards
 * and the public share page: a span is an integer 1–12, a height an integer
 * inside `manualHeightBounds` and only on a widget whose height is the
 * reader's to set (`heightUnitFor`). Anything else reads as "no manual size".
 */
export const MANUAL_SIZE_KEY = "manual_size";

function rawManualSize(slot: WidgetSlot): Record<string, unknown> | undefined {
  const raw = (slot.config as Record<string, unknown> | undefined)?.[MANUAL_SIZE_KEY];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
}

/** The module's manual width in twelfths, or undefined. */
export function manualSpanOf(slot: WidgetSlot): number | undefined {
  const span = rawManualSize(slot)?.span;
  if (typeof span !== "number" || !Number.isInteger(span)) return undefined;
  return span >= 1 && span <= PANEL_GRID_COLS ? span : undefined;
}

/**
 * The heights a reader may give this module, in px — `null` when its height is
 * not theirs to set (it follows its content: KPI, gauge, funnel, note, media,
 * a report table, any `height_policy: "content"` cell). One to twelve of the
 * widget's own row units.
 */
export function manualHeightBounds(slot: WidgetSlot): { min: number; max: number } | null {
  const unit = heightUnitFor(slot);
  return unit ? { min: unit, max: 12 * unit } : null;
}

/** The module's manual height in px, or undefined. */
export function manualHeightOf(slot: WidgetSlot): number | undefined {
  const height = rawManualSize(slot)?.height;
  if (typeof height !== "number" || !Number.isInteger(height)) return undefined;
  const bounds = manualHeightBounds(slot);
  return bounds && height >= bounds.min && height <= bounds.max ? height : undefined;
}

/**
 * The narrowest span at which this widget still clears its own floor at this
 * width. A manual width under it is PROJECTED up to it on a narrow panel — the
 * stored size is not touched, so the desktop width comes back on a wide one.
 */
export function minSpanFor(widget: WidgetType, width: number): number {
  const minPx = gridRule(widget).minPx;
  for (let span = 1; span <= PANEL_GRID_COLS; span += 1) {
    if (spanPx(span, width) >= minPx) return span;
  }
  return PANEL_GRID_COLS;
}

/**
 * The longest run starting at `i` whose slots ALL claim a width, stopping as
 * soon as those widths add to twelve.
 *
 * Greedy on purpose: two declared rows back to back (9/3 then 3/3/6) are two
 * rows, and a run that swallowed both would sum to 24 and be rejected, sending
 * five perfectly-declared cards back to generic packing.
 */
function declaredRun(slots: WidgetSlot[], i: number): WidgetSlot[] | null {
  const run: WidgetSlot[] = [];
  let total = 0;
  for (let k = i; k < slots.length; k += 1) {
    const span = declaredSpan(slots[k]);
    if (typeof span !== "number") return null;
    run.push(slots[k]);
    total += span;
    if (total === PANEL_GRID_COLS) return run;
    if (total > PANEL_GRID_COLS) return null;
  }
  return null;
}

function declaredSpans(run: WidgetSlot[], width: number): number[] | null {
  const spans = run.map(declaredSpan);
  if (spans.some((n) => typeof n !== "number")) return null;
  const declared = spans as number[];
  if (declared.reduce((a, b) => a + b, 0) !== PANEL_GRID_COLS) return null;
  const fits = run.every((s, i) => spanPx(declared[i], width) >= gridRule(s.widget).minPx);
  return fits ? declared : null;
}

function isReportGauge(slot: WidgetSlot): boolean {
  if (slot.widget !== "goal_gauge") return false;
  const c = slot.config as { presentation?: string } | undefined;
  return c?.presentation === "command_center";
}

function ownsItsRow(slot: WidgetSlot): boolean {
  if (slot.widget !== "table") return false;
  const c = slot.config as { presentation?: string } | undefined;
  return c?.presentation === "command_center";
}

/**
 * A declared pair, in EITHER order.
 *
 * `dominant, companion` draws 8/4; `companion, dominant` draws 4/8. Both orders
 * exist on the approved board — a chart with its breakdown on the right, and a
 * narrow split with the wide card it explains on the right — and forcing one
 * order would mean authoring the sections in an order the reader does not read
 * them in.
 */
function pairAt(slots: WidgetSlot[], i: number): [number, number] | null {
  const a = layoutRole(slots[i]);
  const b = layoutRole(slots[i + 1] ?? slots[i]);
  if (i + 1 >= slots.length) return null;
  if (a === "dominant" && b === "companion") return [8, 4];
  if (a === "companion" && b === "dominant") return [4, 8];
  return null;
}

/**
 * The end of a run of ADJACENT slots of the same compact widget — a KPI band,
 * a creative wall, a row of gauges.
 *
 * What makes a compact widget compact is that a GROUP of them tiles uniformly.
 * One of them is not a group: a single gauge between two charts was taking its
 * own tile width and cutting the run around it, so the chart before it was
 * left alone and took twelve while the gauge kept six — a row of eighteen,
 * which the browser wraps into a full row plus a half-empty one. Measured on
 * the TikTok Lead Gen board at 770px: `funnel:12` then `goal_gauge:6 +
 * ranking:12`. Grouping is therefore what decides which rule applies, not the
 * widget type alone.
 */
function compactBandEnd(slots: WidgetSlot[], i: number): number {
  const widget = slots[i].widget;
  let end = i;
  while (end < slots.length && slots[end].widget === widget) end += 1;
  return end;
}

/** Whether a declared run of `length` slots at `i` ends before its band does and leaves a card without a declared width. */
function runSplitsBand(slots: WidgetSlot[], i: number, length: number): boolean {
  const end = compactBandEnd(slots, i);
  if (end - i <= length) return false;
  return slots.slice(i + length, end).some((s) => declaredSpan(s) === undefined);
}

/** Whether this compact slot stands alone, i.e. has no same-widget neighbour. */
function isLoneCompact(slots: WidgetSlot[], i: number): boolean {
  return COMPACT.has(slots[i].widget) && compactBandEnd(slots, i) - i === 1;
}

/** A slot the greedy packer may gather into a row. */
function isRunnable(slots: WidgetSlot[], i: number): boolean {
  const widget = slots[i].widget;
  return DOMINANT.has(widget) || COMPANION.has(widget) || isLoneCompact(slots, i);
}

/**
 * The span each tile of a compact BAND takes.
 *
 * `slotsPerRow` picks the most tiles that clear the widget's floor and stops
 * there — it cannot see how many tiles the band holds. Six creatives at four
 * per row is a row of four and a row of two, and the widget after the wall
 * then lands in that half-row's remainder: at 770px the board emitted
 * `media_card:3 ×2 + heatmap:12`, eighteen columns.
 *
 * So a band that SPILLS past one row and divides raggedly drops to the largest
 * smaller per-row that divides both the band and twelve and still clears the
 * floor: six tiles become two rows of three. Two bounds on that:
 *
 *   - never below two per row — a band collapsed to one tile per row is a wall
 *     of full-width cards, worse than the gap it closes;
 *   - never when the band FITS one row (`count <= natural`). Two KPI cards
 *     must stay two KPI cards, not two half-page cards: a tile's width comes
 *     from what it prints, and inflating it to fill the row is the same
 *     whitespace fault seen from the other side.
 *
 * A spilling band with no usable divisor (five KPI cards) is split into
 * balanced rows by `balancedTileSpans` before this is consulted; this span is
 * the fallback when no balanced split clears the floor.
 */
function bandSpan(widget: WidgetType, layoutW: number, count: number, width: number): number {
  const natural = slotsPerRow(widget, layoutW, width);
  if (count <= natural || count % natural === 0) return PANEL_GRID_COLS / natural;
  const rule = gridRule(widget);
  for (const perRow of PER_ROW_OPTIONS) {
    if (perRow < 2 || perRow >= natural) continue;
    if (count % perRow !== 0 || PANEL_GRID_COLS % perRow !== 0) continue;
    const columnPx = (width - PANEL_GRID_GAP_PX * (perRow - 1)) / perRow;
    if (columnPx >= rule.minPx) return PANEL_GRID_COLS / perRow;
  }
  return PANEL_GRID_COLS / natural;
}

export function assignSpans(slots: WidgetSlot[], width: number): number[] {
  // Nobody resized anything: the automatic layout, exactly as it always was.
  if (!slots.some((slot) => manualSpanOf(slot) !== undefined)) return closeRowHoles(slots, autoSpans(slots, width));
  // A resized module takes its own width (never under its floor at this width),
  // and splits the board into runs the automatic rules lay out as before.
  const spans: number[] = [];
  const manual = new Set<number>();
  let i = 0;
  while (i < slots.length) {
    const own = manualSpanOf(slots[i]);
    if (own !== undefined) {
      spans.push(Math.max(own, minSpanFor(slots[i].widget, width)));
      manual.add(i);
      i += 1;
      continue;
    }
    let end = i;
    while (end < slots.length && manualSpanOf(slots[end]) === undefined) end += 1;
    spans.push(...autoSpans(slots.slice(i, end), width));
    i = end;
  }
  return closeRowHoles(slots, spans, manual);
}

/** The automatic spans, before the rows are closed (`closeRowHoles`). */
function autoSpans(slots: WidgetSlot[], width: number): number[] {
  const spans: number[] = [];
  let i = 0;
  while (i < slots.length) {
    const current = slots[i];

    // A DECLARED pair: the chart and its breakdown, the table and its split.
    //
    // Runs after the declared-WIDTH row above and before everything else. Both
    // of those orderings matter: a row that names its own widths is more
    // specific than a role-based pair, and every branch below would claim one
    // half of a pair on its own — the table would own a whole row and its
    // companion would land under it, which is the layout this exists to
    // replace. When the width cannot honour the pair, both fall through and
    // stack the ordinary way.
    // A row whose cards DECLARE their own widths.
    //
    // The approved WhatsApp board needs 9/3 (a delivery strip beside the module
    // that is switched off) and 3/3/6 (a ring, a match rate, and a wider
    // service-commitment card). Neither is expressible as an even split or an
    // 8/4 pair, and both are statements the board makes about itself rather
    // than something the engine could infer.
    //
    // Gated three ways, because this function reaches production dashboards and
    // the public share page: EVERY slot in the run must claim a width, the
    // widths must add to exactly twelve, and each must still clear its own
    // minimum at this width. Fail any of those and the run falls through to the
    // packing it has always had — a partially declared row would leave a hole,
    // and a declared row at a narrow panel would squeeze a card under its floor.
    const run = declaredRun(slots, i);
    // A declared run that stops INSIDE a band of adjacent compact cards, while
    // a later card of that band declares nothing, is half a statement: honouring
    // it drew one card full-width and tiled the rest (CPM alone, then 4/4/4).
    // The band is then tiled as one group below; a band that declares every
    // card still reads its widths.
    const splitsBand = run
      ? COMPACT.has(current.widget) && runSplitsBand(slots, i, run.length)
      : false;
    if (run && !splitsBand) {
      const declared = declaredSpans(run, width);
      if (declared) {
        spans.push(...declared);
        i += run.length;
        continue;
      }
    }

    const declaredPair = pairAt(slots, i);
    if (declaredPair) {
      const pair = pairSpans(current, slots[i + 1], width, declaredPair);
      if (pair) {
        spans.push(...pair);
        i += 2;
        continue;
      }
    }

    // A wall of REPORT tiles tiles the row exactly, by the same divisor rule.
    // Six creatives at span 3 laid out 4 + 2 and left half a row empty under
    // the wall. Read off the config, so every other wall keeps its 4 + 2.
    if (isReportMedia(current)) {
      let end = i;
      while (end < slots.length && isReportMedia(slots[end])) end += 1;
      const count = end - i;
      spans.push(...tiledSpans(current.widget, count, width));
      i = end;
      continue;
    }

    // A RANKED KPI band tiles as ONE group, so the whole headline fits one row
    // wherever it can and every row it does take is full. Tiles that declare no
    // rank fall through to the original path untouched.
    if (isRankedKpi(current)) {
      // The whole ADJACENT run of KPI cards, ranked or not: a headline card
      // that carries `emphasis` beside three that do not is still one band, and
      // tiling only the ranked card drew it alone on a full row.
      const end = compactBandEnd(slots, i);
      const count = end - i;
      spans.push(...tiledSpans(current.widget, count, width));
      i = end;
      continue;
    }

    // A row of REPORT gauges tiles by the same divisor rule — unless the cards
    // DECLARE their own widths, which is how a row of three unequal cards
    // (a ring, a rate and a wider service-commitment card) stays one row.
    if (isReportGauge(current)) {
      let end = i;
      while (end < slots.length && isReportGauge(slots[end])) end += 1;
      const count = end - i;
      const declared = declaredSpans(slots.slice(i, end), width);
      if (declared) {
        spans.push(...declared);
        i = end;
        continue;
      }
      spans.push(...tiledSpans(current.widget, count, width));
      i = end;
      continue;
    }

    // A BAND of compact tiles — two or more of the same widget side by side.
    // One compact slot is not a band: it falls through to the packer below and
    // shares a row like any companion, which is what stops it from cutting the
    // run it stands in the middle of.
    if (COMPACT.has(current.widget) && !isLoneCompact(slots, i)) {
      const end = compactBandEnd(slots, i);
      const count = end - i;
      // Rows of tiles that each fill the twelve; the old single-span rule only
      // when the width leaves no balanced split (a five-card band otherwise
      // drew four cards and a fifth stretched across a whole row).
      const rule = gridRule(current.widget);
      const cap = Math.min(rule.maxPerRow, capFromLayoutW(current.layout.w));
      const balanced = count > 1 ? balancedTileSpans(current.widget, count, width, cap) : null;
      const span = bandSpan(current.widget, current.layout.w, count, width);
      spans.push(...(balanced ?? Array<number>(count).fill(span)));
      i = end;
      continue;
    }

    const packable = isRunnable(slots, i) && !ownsItsRow(current);
    if (!packable) {
      spans.push(PANEL_GRID_COLS);
      i += 1;
      continue;
    }

    // Chỉ những slot liền kề mới được xếp chung hàng — nhảy cóc qua một widget
    // khác vai là sắp lại thứ tự backend, không phải xếp hàng (xem "Who owns
    // arrangement": backend giữ quyền quyết định thứ tự).
    let end = i;
    while (
      end < slots.length &&
      isRunnable(slots, end) &&
      // A widget that owns its row also ENDS the run before it: the chart and
      // the pie pair up, and the table below them starts a row of its own.
      !ownsItsRow(slots[end])
    ) {
      end += 1;
    }

    const row = packRow(slots.slice(i, end), width);
    spans.push(...row);
    i += row.length;
  }
  return spans;
}

/**
 * Every drawn row ends at the twelfth column.
 *
 * The packers above decide each run on its own, as if it started a fresh row.
 * It often does not: a two-card KPI band leaves six columns, the next run's
 * chart fills them, and the pie `packRow` paired with that chart is left alone
 * on a half-empty row. A band that fits one row but not its width (three KPI
 * cards at span 3) leaves the rest of the row empty before a full-width header.
 * Swept 2026-09-25 over 38 template boards at every 10px from 320 to 1600:
 * rows of 6, 8, 9 and 10 columns on 6 boards.
 *
 * Walked on the rows CSS will actually draw (`spanRowIndices`), and only ever
 * WIDENS a card up to the twelfth column, so no card changes row:
 *   - a row with any non-tile card gives the leftover to its last such card —
 *     a chart or list can use the width, a tile cannot;
 *   - a row of tiles only (KPI, gauge, media) is re-tiled evenly when twelve
 *     divides by its count, so the tiles stay one size; otherwise it is left
 *     as it is.
 */
function closeRowHoles(slots: WidgetSlot[], spans: number[], manual?: ReadonlySet<number>): number[] {
  const out = [...spans];
  for (const row of spanRowIndices(out)) {
    const used = row.reduce((sum, k) => sum + out[k], 0);
    const leftover = PANEL_GRID_COLS - used;
    if (leftover <= 0) continue;
    // A module the reader sized keeps its size: the hole goes to a neighbour
    // that has none, or stays — never back into the resized module.
    const wide = row.filter((k) => !COMPACT.has(slots[k].widget) && !manual?.has(k));
    if (wide.length) {
      out[wide[wide.length - 1]] += leftover;
    } else if (row.some((k) => manual?.has(k))) {
      continue;
    } else if (PANEL_GRID_COLS % row.length === 0) {
      for (const k of row) out[k] = PANEL_GRID_COLS / row.length;
    }
  }
  return out;
}

/**
 * The rows a span list actually draws, as index groups.
 *
 * Walked the way CSS auto-placement places items: a card joins the current row
 * only while it still FITS in what is left of the twelve. This is the ONE
 * definition of "same row" in the panel — height equalisation reads it, and so
 * does resizing, which must trade columns with the cards a reader can see
 * beside the one they are dragging.
 */
export function spanRowIndices(spans: number[]): number[][] {
  const rows: number[][] = [];
  let i = 0;
  while (i < spans.length) {
    let total = 0;
    const row: number[] = [];
    while (i < spans.length && (row.length === 0 || total + spans[i] <= PANEL_GRID_COLS)) {
      total += spans[i];
      row.push(i);
      i += 1;
    }
    rows.push(row);
  }
  return rows;
}

// Khoá tóm tắt span của toàn bộ danh sách slot ở một bề rộng — dùng để biết bố
// cục lưới có thực sự đổi hay không trước khi phát re-render. ResizeObserver
// bắn liên tục lúc kéo resize, nhưng span mỗi slot chỉ đổi ở vài ngưỡng bề
// rộng rời rạc; nếu khoá không đổi thì layout hệt như cũ.
//
// PHẢI dùng assignSpans ở đây, không phải slotSpan từng slot: span của một slot
// phụ thuộc vào cả hàng nó nằm trong, nên bố cục đổi ở những bề rộng mà KHÔNG
// slot nào tự đổi span một mình — ví dụ một cặp dominant + companion chuyển từ
// [12, 12] sang [8, 4] ngay khi companion vừa đủ sàn ở span 4. Tính khoá bằng
// slotSpan từng slot sẽ ra cùng một chuỗi trước và sau ngưỡng đó, nên panel
// không bao giờ re-render và phần xếp hàng lặng lẽ không xuất hiện lúc kéo.
// Sắp xếp + nhóm media giống hệt pipeline render (DashboardPanel) để tính kề
// nhau (adjacency) nhất quán giữa khoá và những gì thực sự lên màn hình.
export function panelLayoutKey(slots: WidgetSlot[], width: number): string {
  const ordered = orderSlots(slots);
  const spans = assignSpans(ordered, width);
  return ordered.map((s, i) => `${s.slot_id}:${spans[i]}`).join("|");
}

// ─── Row heights ────────────────────────────────────────────────────────────
//
// Moved here from `DashboardPanel` so the thumbnails (`TemplateBoardMiniature`,
// `DashboardBlockView`) and `widgetFormat` read the same rules without
// importing a 3,000-line client component. Pure: no DOM, no React.

/**
 * One grid unit of `layout.h`, in px — the row pitch every floor, chart height
 * and heal rule is measured in. A `line_chart` at the producer's default
 * `h: 3` is therefore 228px.
 */
export const ROW_UNIT_PX = 76;

/** A plain table's unit: it packs ~30px rows, so needs more per `layout.h`. */
const TABLE_UNIT_PX = 104;

/**
 * How a card takes part in its row's height.
 *
 *   chart   — fills any definite height it is given (svg/canvas at 100%)
 *   list    — a table or ranking: has a content height, scrolls when shorter
 *   content — everything else: as tall as what it prints, cannot scroll
 *   kpi / header — rows the planner leaves exactly as they were
 */
export type RowKind = "kpi" | "header" | "chart" | "list" | "content";

/**
 * Every widget's row behaviour in ONE table: its `kind`, and — for the BOUNDED
 * widgets only — `unitPx`, what one unit of `layout.h` is worth.
 *
 * Bounded widgets take a DEFINITE cell height so their content fits a fixed
 * box: the table SCROLLS its rows inside (see DataTable), the charts FILL it
 * (svg height:100% needs a definite parent — see LineChart/BarChart/PieChart).
 * The per-unit height differs (a table packs ~30px rows, so needs more per
 * layout.h than a chart), which alone would leave a chart shorter than a table
 * sharing its row.
 *
 * This used to be two lists — a unit table and a `switch` naming the same six
 * types — free to drift apart. A widget absent here is `content`, unbounded.
 */
const WIDGET_ROW_RULES: Readonly<Record<string, { kind: RowKind; unitPx?: number }>> = {
  kpi_card: { kind: "kpi" },
  section_header: { kind: "header" },
  line_chart: { kind: "chart", unitPx: ROW_UNIT_PX },
  bar_chart: { kind: "chart", unitPx: ROW_UNIT_PX },
  pie_chart: { kind: "chart", unitPx: ROW_UNIT_PX },
  // Unbounded, a scatter got only a minHeight, and its svg — width 100% with
  // no height — grew to the 560:320 viewBox ratio instead: ~580px in a
  // full-width cell against the 228px a line chart takes at the same layout.h.
  scatter_bubble: { kind: "chart", unitPx: ROW_UNIT_PX },
  table: { kind: "list", unitPx: TABLE_UNIT_PX },
  // A ranking row is 56px and its labels `truncate` rather than wrap, so the
  // unit can match the pitch exactly: at 104 the grid could only round to the
  // nearest ~2 rows, which left a one-row list in 312px of mostly blank card.
  // The list also scrolls (overflow-y-auto), so a tight box cannot hide a row.
  ranking: { kind: "list", unitPx: 56 },
};

function rowRuleOf(widget: string): { kind: RowKind; unitPx?: number } | undefined {
  return Object.prototype.hasOwnProperty.call(WIDGET_ROW_RULES, widget)
    ? WIDGET_ROW_RULES[widget]
    : undefined;
}

/** The px one `layout.h` unit is worth for a BOUNDED widget; undefined otherwise. */
function boundedUnitPx(widget: string): number | undefined {
  return rowRuleOf(widget)?.unitPx;
}

/**
 * How a surface sizes its cells. Absent keeps the panel's rules; the Pulse chat passes
 * `hugContent`: tables, rankings, funnels, notes and section headers take their content's height.
 */
export interface SlotSizing {
  hugContent?: boolean;
}

/** Widgets drawn in HTML, as tall as their rows; svg/canvas charts keep their box. */
const HUGGING_WIDGETS: ReadonlySet<string> = new Set(["table", "ranking", "funnel", "note", "section_header"]);

function hugsContent(slot: WidgetSlot, sizing: SlotSizing | undefined): boolean {
  return Boolean(sizing?.hugContent) && HUGGING_WIDGETS.has(slot.widget);
}

/**
 * Chiều cao mà một ô lưới nhận, tách riêng khỏi JSX để test được bằng dữ liệu
 * thay vì bằng DOM.
 *
 * Ba nhánh, theo đúng thứ tự cũ:
 *  - kpi_card ôm nội dung, không sàn — một con số đứng giữa hộp nửa trống thì
 *    tệ hơn là một thẻ thấp.
 *  - widget "bounded" (bảng + biểu đồ) nhận chiều cao XÁC ĐỊNH, bằng ô cao
 *    nhất trong cùng hàng, vì svg cần cha có chiều cao thật và bảng cuộn bên
 *    trong hộp cố định.
 *  - còn lại nhận sàn `layout.h × 76`.
 *
 * Ngoại lệ là ô đã tự khai `height_policy: "content"`, và tiêu đề nhóm của
 * template nay luôn khai nó: `layout.h = 1` cho tiêu đề sàn 76px trong khi nội
 * dung chỉ ~40px, và 36px thừa đọc ra thành khoảng cách giữa tiêu đề và đúng
 * thứ nó đang giới thiệu. Tiêu đề đến TỪ PRODUCER không khai gì — mọi dashboard
 * ngoài template — đi tiếp nhánh cũ không đổi một byte.
 */
export function slotHeightStyle(
  slot: WidgetSlot,
  rowHeight: number,
  sizing?: SlotSizing,
): { height?: string; minHeight?: string; alignSelf?: string } {
  if (slot.widget === "kpi_card") return {};
  if (hugsContent(slot, sizing)) return {};
  const reportVariant =
    (slot.config as { presentation?: string } | undefined)?.presentation === "command_center";
  // Một bảng BÁO CÁO ôm lấy nội dung của nó.
  //
  // `table` là widget bounded (WIDGET_ROW_RULES) nên bình thường nhận chiều cao CỨNG
  // `layout.h × 104` — 520px ở h = 5 — rồi `h-full` bên trong DataTable kéo
  // thân bảng đầy hộp đó. Với sáu dòng (~270px bảng + ~72px chrome) thì gần
  // 180px cuối cùng là khoảng trắng chết sau dòng "Tổng".
  //
  // Bỏ chiều cao cứng, KHÔNG bỏ khả năng cuộn: DataTable tự đặt trần px cho
  // vùng cuộn của nó (REPORT_MAX_BODY_PX), nên bảng ngắn ôm nội dung còn bảng
  // dài vẫn cuộn với thead dính. Mọi bảng khác đi tiếp nhánh dưới không đổi.
  // A cell the WIDGET says should hug its content.
  //
  // Read off the config, and it is the only thing consulted — not the widget
  // type, not the board. A floor is a guess the builder makes from `layout.h`,
  // and `layout.h` cannot know how WIDE the cell will be: the same eight
  // readings are one row at 8/12 on a desktop and three rows at 12/12 on a
  // phone. When that guess comes out too large the difference is whitespace the
  // card cannot shrink out of, which is exactly what this removes. A guess that
  // comes out too SMALL costs nothing — content grows past a minimum — so
  // dropping the floor can never clip anything.
  const contentSized =
    (slot.config as { height_policy?: string } | undefined)?.height_policy === "content";
  if (contentSized) return {};
  if (slot.widget === "table" && reportVariant) return {};
  // Một TIÊU ĐỀ NHÓM đã bật cờ cũng ôm lấy nội dung của nó. `layout.h = 1` cho
  // nó sàn 76px trong khi một tiêu đề chỉ cao ~40px, và 36px thừa đọc ra thành
  // khoảng cách giữa tiêu đề và đúng thứ nó đang giới thiệu — tiêu đề trôi về
  // phía cụm PHÍA TRÊN. Tiêu đề không bật cờ đi tiếp nhánh dưới, không đổi.
  if (slot.widget === "section_header" && reportVariant) return {};
  if (boundedUnitPx(slot.widget)) return { height: `${rowHeight}px` };
  // A FLOOR IS NOT A HEIGHT, and the grid was reading it as one. The panel's
  // grid stretches its items by default, so a funnel or a gauge beside a
  // 300px chart was drawn 300px tall with its content sitting in the top
  // third — measured on the TikTok Lead Gen board at 1000px, ~150px of white
  // inside each of the two cards. `alignSelf: start` is what lets a card that
  // has no definite height be as tall as what it prints.
  //
  // Only this branch. A bounded widget above already has a real height (its
  // svg needs a parent with one), and a kpi_card keeps stretching so a band of
  // them stays a band even when one card carries a second line of text.
  return { minHeight: `${Math.max(1, slot.layout.h) * ROW_UNIT_PX}px`, alignSelf: "start" };
}

/**
 * The vertical unit a card is measured in, or `null` when its height is not
 * the reader's to set.
 *
 * Derived from `slotHeightStyle` — the function that actually draws the cell —
 * rather than from a second list beside it. That list was the bug: keying the
 * handle on the bounded-unit list offered a vertical drag on a REPORT table,
 * whose branch returns `{}` and ignores `layout.h` entirely, so the drag
 * stored a number and drew nothing. Measured 2026-09-21 across every widget:
 *
 *   kpi_card, section_header (report), table (report), any `height_policy:
 *   "content"` cell        →  style never mentions layout.h
 *   gauge, heatmap, funnel, note, media_card
 *                          →  layout.h is a FLOOR under content, and a floor
 *                             that stays under the content is invisible
 *   line/bar/pie/scatter, table, ranking
 *                          →  a definite height the content fills
 *
 * Only the last group has a height a reader can change and see. The middle
 * group is why this returns null rather than a unit: any floor a drag could
 * legally reach renders identically, so offering the axis would be offering a
 * control with no output — the defect this round exists to remove.
 */
export function heightUnitFor(slot: WidgetSlot): number | null {
  // Probed at rowHeight 0: a definite height is the branch that emits one.
  if (slotHeightStyle(slot, 0).height === undefined) return null;
  return boundedUnitPx(slot.widget) ?? null;
}

/**
 * The most 76px rows that still fit INSIDE a measured content height, never
 * fewer than one.
 *
 * Rounded down: a floor is only invisible while it stays under the card.
 * Measured on the gauge in the report, the card is 166px, so two rows (152px)
 * disappear behind the content and three (228px) would leave 62px of empty
 * cell inside the selection ring.
 *
 * Used to HEAL rather than to clamp: boards saved before the vertical axis was
 * taken off these cards carry an inflated `layout.h` (the reported one is at
 * 4), and nothing else would ever bring it down.
 */
export function rowsWithinContent(contentPx: number): number {
  return Math.max(1, Math.floor(contentPx / ROW_UNIT_PX));
}

// Equalise bounded-widget heights WITHIN each grid row: every bounded cell in a
// row takes the row's TALLEST bounded height. A chart beside a taller table then
// matches it (no gap under the shorter card); a chart-only row keeps the chart's
// own height.
//
// Rows are walked the way CSS auto-placement lays them out: a card joins the
// current row only while it still FITS in what is left of the twelve, and a
// card that does not fit opens the next row. Closing at ">= 12" instead read a
// 3-column KPI tile followed by a 12-column table as one row of fifteen — a
// row the browser never draws — and then equalised the heights of two cards
// that are not side by side.
export function boundedRowHeights(
  slots: WidgetSlot[],
  spans: number[],
  extraForLastRow = 0,
  sizing?: SlotSizing,
): number[] {
  const heights = new Array<number>(slots.length).fill(0);
  // One definition of "same row" (`spanRowIndices`), so heights are equalised
  // across the cards actually drawn beside each other.
  const rows = spanRowIndices(spans);
  for (const row of rows) {
    const i = row[row.length - 1] + 1;
    let tallest = 0;
    for (const k of row) {
      // A hugging table sets no height, so its `h × 104` must not stretch a chart beside it.
      const unit = hugsContent(slots[k], sizing) ? undefined : boundedUnitPx(slots[k].widget);
      if (unit) tallest = Math.max(tallest, Math.max(1, slots[k].layout.h) * unit);
    }
    // Only the trailing row absorbs the leftover panel space — a bounded row
    // is only ever the LAST row it's applied to; extraForLastRow is the gap
    // between the container's real height and the grid's unstretched height.
    //
    // A REPORT board opts out of that stretch. Filling the viewport is right
    // for a live panel, where a short board would otherwise end in a band of
    // background; it is wrong for a report, which is read by scrolling and
    // whose cards should be as tall as their contents. On a three-widget board
    // the leftover was ~430px, so a chart with 250px of data was drawn 850px
    // tall and the pie beside it was mostly white.
    const stretches = !row.some(
      (k) => (slots[k].config as { presentation?: string } | undefined)?.presentation,
    );
    if (i >= slots.length && tallest > 0 && stretches) tallest += extraForLastRow;
    for (const k of row) heights[k] = tallest;
  }
  return heights;
}

export function rowKindOf(slot: WidgetSlot): RowKind {
  return rowRuleOf(slot.widget)?.kind ?? "content";
}

/** The shortest a chart is drawn when it shares a row with cards that are not
 *  charts: three 76px rows, the height a default line chart takes. */
export const CHART_MIN_ROW_PX = 3 * ROW_UNIT_PX;

/**
 * One definite height per card, so every card in a row ends on the same line
 * with as little empty space inside or under it as the row allows.
 *
 * `boundedRowHeights` equalised only charts and lists, and to the TALLEST of
 * them, measured in each widget's own unit. Audited 2026-09-25 across the 32
 * templates and four saved boards (850 cells), that produced every large gap:
 *   - a 5-row ranking or a pie raised to a 520px table beside it (245 / 150px
 *     empty inside);
 *   - a table fixed at `h × 104` whatever its row count (up to 256px empty);
 *   - a funnel, gauge or note left at its content height beside a 304px chart
 *     (up to 194px empty under it).
 *
 * Here the row is sized from what its cards actually hold (`naturals`, px,
 * measured by the panel with the card at `height: auto`):
 *   - content cards cannot shrink, so the row is at least the tallest of them;
 *   - lists want their content height, capped for a plain table at `h × 104`
 *     (a longer table scrolls, as before);
 *   - charts give way: beside other cards they are drawn anywhere from
 *     `CHART_MIN_ROW_PX` up, alone they keep `h × 76`.
 * With lists and charts only, the row takes the SHORTEST of their preferred
 * heights — a longer list scrolls rather than leaving the shorter card empty.
 *
 * `null` leaves a card to `slotHeightStyle`: rows of KPI cards only (they
 * stretch to one another already), section-header rows, and
 * any row not measured yet. A lone content card IS planned, to its own height:
 * its `layout.h × 76` floor is a guess, and a live status bar at `h: 1` sat
 * 38px tall in a 76px cell.
 */
export function planRowHeights(
  slots: WidgetSlot[],
  spans: number[],
  naturals: Readonly<Record<string, number>>,
  extraForLastRow = 0,
): (number | null)[] {
  const plan = new Array<number | null>(slots.length).fill(null);
  const rows = spanRowIndices(spans);
  // A module the reader sized takes its own height; the rest of its row is
  // planned as if it were not there. Nobody resized: every row, as before.
  const sized = slots.map((slot) => manualHeightOf(slot));
  const planRow = (row: number[], last: boolean) => {
    const kinds = row.map((k) => rowKindOf(slots[k]));
    if (kinds.includes("header") || kinds.every((kind) => kind === "kpi")) return;
    const of = (kind: RowKind) => row.filter((_, i) => kinds[i] === kind);
    const charts = of("chart");
    const lists = of("list");
    // A KPI card beside a chart or gauge (a two-card band leaves half a row the
    // next card fills) is a content card here: it cannot grow a body, so the
    // row is sized from what it prints instead of stretching it to the chart.
    const contents = row.filter((_, i) => kinds[i] === "content" || kinds[i] === "kpi");
    const natural = (k: number) => naturals[slots[k].slot_id];
    if ([...lists, ...contents].some((k) => !(natural(k) > 0))) return;

    const designated = charts.map(
      (k) => Math.max(1, slots[k].layout.h) * (boundedUnitPx(slots[k].widget) ?? ROW_UNIT_PX),
    );
    const listPreferred = lists.map((k) => {
      const slot = slots[k];
      const report =
        (slot.config as { presentation?: string } | undefined)?.presentation === "command_center";
      // A report table already caps its own scroll body; a plain one scrolls
      // past the height its layout asks for.
      const cap = slot.widget === "table" && !report
        ? Math.max(1, slot.layout.h) * TABLE_UNIT_PX
        : Infinity;
      return Math.min(natural(k), cap);
    });
    const chartFloor = charts.length ? Math.min(CHART_MIN_ROW_PX, Math.max(...designated)) : 0;

    let height: number;
    if (contents.length) {
      const tallestContent = Math.max(...contents.map(natural));
      const listFloor = lists.length ? Math.min(...listPreferred) : 0;
      height = Math.max(tallestContent, listFloor, chartFloor);
    } else if (lists.length) {
      height = Math.max(Math.min(...listPreferred, ...designated), chartFloor);
    } else {
      height = Math.max(...designated);
    }

    // The trailing row absorbs the panel's leftover height, as before, and
    // only where something can use it: a chart or a list, never a card that
    // would just grow an empty band. A report board never stretches.
    const stretches =
      charts.length + lists.length > 0 &&
      !row.some((k) => (slots[k].config as { presentation?: string } | undefined)?.presentation);
    if (last && stretches) height += extraForLastRow;
    for (const k of row) plan[k] = Math.round(height);
  };
  rows.forEach((row, rowIndex) => {
    const rest = row.filter((k) => sized[k] === undefined);
    for (const k of row) if (sized[k] !== undefined) plan[k] = sized[k]!;
    if (rest.length) planRow(rest, rowIndex === rows.length - 1);
  });
  return plan;
}
