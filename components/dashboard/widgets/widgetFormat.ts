// Logic thuần (không React) — test độc lập được.
import { bindingMetrics, bindingSource } from "./types";
import type { BarGroup, ColumnFormat, ConditionOp, FunnelStage, LineSeries, PieSlice, SeriesPoint, TableColumn, TableRow, WidgetBinding } from "./types";
import { ROW_UNIT_PX } from "@/lib/dashboard/layoutEngine";
import { dashboardPlatformLabel } from "@/lib/dashboard/platformLabel";
import { metricMeta } from "@/lib/dashboard/vocabulary";
import { isIsoDayShape } from "./widgetPeriod";

export type DeltaTone = "positive" | "negative" | "neutral";

/**
 * The array a widget can actually render — `[]` when the producer sent
 * something that is not one.
 *
 * A slot's config is TYPED but never validated at runtime. Two sources feed it
 * and only one of them ever carries data: a snapshot slot holds a real render
 * (`series`, `stages`, `groups`, `slices`, `rows`), while a DEFINITION slot
 * holds just the durable metadata its author wrote — the livestream template's
 * line chart is literally `{ label: "Xu hướng GMV" }`, with no `series` key at
 * all. `mergeDashboardSlots` hands the definition through untouched for a board
 * that has never rendered, exactly as it should: inventing `series: []` there
 * would forge a measurement the board never took.
 *
 * So the runtime check belongs here, at the point of use. The `slot as
 * WidgetSlot<LineChartConfig>` casts in WidgetRenderer are compile-time only
 * and check nothing; `c.series.length` on that config threw before WidgetShell
 * ever got the chance to show its empty state.
 *
 * This normalizes SHAPE, never values: a missing array reads as "nothing to
 * draw", which is what the empty state says — it does not become a zero.
 */
export function renderableArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// ── Item-level guards ──────────────────────────────────────────────────────
//
// `renderableArray` only proves the CONTAINER is an array. A producer can hand
// back a real array with holes in it — `slices: [{…}, null]`, `rows: [null]`,
// `bars: [{…}, null]` — and the bodies read straight into each item
// (`s.value`, `b.value`, `row[col.key]`), so a single null still crashes the
// board. NaN and Infinity are just as damaging further down: they propagate
// into path geometry and render an invisible or malformed chart.
//
// Each guard below KEEPS the items that can be drawn and drops only the ones
// that cannot — a report with three good slices and one broken one is still
// worth showing, and dropping the broken one is not the same as inventing a
// zero for it. When nothing survives, the array comes back empty and the
// widget's own `empty` check falls through to the shell's empty state.

/** Any non-null object — arrays INCLUDED (a row of a `renderableArray` may be one;
 *  the wire parser's `isRecord` in `lib/dashboard/drivers` rejects them). */
function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A drawable number: finite, so NaN and ±Infinity never reach the geometry. */
function isFinitePlot(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * `y: null` SURVIVES here, deliberately: it is the documented marker for a day
 * inside the window the platform has not synced (see SeriesPoint), and the line
 * renderer breaks at it. Turning it into 0 would report a measurement.
 */
function renderablePoints(value: unknown): SeriesPoint[] {
  return renderableArray<unknown>(value).filter(
    (point): point is SeriesPoint =>
      isObjectLike(point) &&
      (typeof point.x === "string" || typeof point.x === "number") &&
      (point.y === null || isFinitePlot(point.y)),
  );
}

export function renderableSeries(value: unknown): LineSeries[] {
  return renderableArray<unknown>(value)
    .filter(isObjectLike)
    .map((series) => ({ ...series, points: renderablePoints(series.points) }) as LineSeries);
}

export function renderableStages(value: unknown): FunnelStage[] {
  return renderableArray<unknown>(value).filter(
    (stage): stage is FunnelStage => isObjectLike(stage) && isFinitePlot(stage.value),
  );
}

export function renderableSlices(value: unknown): PieSlice[] {
  return renderableArray<unknown>(value).filter(
    (slice): slice is PieSlice => isObjectLike(slice) && isFinitePlot(slice.value),
  );
}

export function renderableGroups(value: unknown): BarGroup[] {
  const groups = (
    renderableArray<unknown>(value)
      .filter(isObjectLike)
      .map(
        (group) =>
          ({
            ...group,
            // `value: null` SURVIVES (TA-03): the row carries no value for that
            // series. BarPlot draws no bar for it and the tooltip reads "—", and
            // the category keeps its place on the axis. A value that is neither
            // null nor a finite number cannot be drawn and is dropped.
            bars: renderableArray<unknown>(group.bars).filter(
              (bar): bar is BarGroup["bars"][number] =>
                isObjectLike(bar) && (bar.value === null || isFinitePlot(bar.value)),
            ),
          }) as BarGroup,
      )
      .filter((group) => group.bars.length > 0)
  );
  // Nothing measured at all is not a chart: all-null bars would let the widget
  // claim `ok` while drawing no bars, so it falls through to the empty state.
  return groups.some((group) => group.bars.some((bar) => bar.value !== null)) ? groups : [];
}

/** `key` is what every row lookup goes through, so a column without one is unusable. */
export function renderableColumns(value: unknown): TableColumn[] {
  return renderableArray<unknown>(value).filter(
    (column): column is TableColumn => isObjectLike(column) && typeof column.key === "string",
  );
}

export function renderableRows(value: unknown): TableRow[] {
  return renderableArray<unknown>(value).filter((row): row is TableRow => isObjectLike(row));
}

// Hướng màu delta theo good_direction: tăng-khi-tốt hoặc giảm-khi-tốt đều là "positive".
export function deltaTone(delta: number | undefined, good: "up" | "down" | undefined): DeltaTone {
  // No stated direction is no judgement: the move is drawn neutral.
  if (delta === undefined || delta === 0 || good === undefined) return "neutral";
  return delta > 0 === (good === "up") ? "positive" : "negative";
}

// BA trạng thái, không phải hai. `undefined` = KHÔNG so được (không có kỳ trước,
// hoặc cửa sổ thiếu ngày nên producer bỏ hẳn `delta`); `0` = ĐÃ so và đứng yên.
// Gộp chúng vào cùng một tấm thẻ trống là cách thẻ "Tần suất" in "so với 3/9–9/9"
// ở chân mà không mang badge nào (đo 2026-09-18): nó khai có so sánh rồi im lặng
// về kết quả, và người đọc không tách được nó khỏi một thẻ mất baseline.
//
// Tần suất = hiển thị ÷ tiếp cận. Tử và mẫu cùng tăng ~5.6% nên tỉ số đổi dưới
// 0.05%, và `round(delta, 1)` của `_comparison_config` trả đúng 0.0 — đây là
// hành vi BÌNH THƯỜNG của mọi metric phi cộng tính (`vocab.NON_ADDITIVE_METRICS`),
// không phải một ca hiếm đáng bỏ qua.
//
// "≈" chứ không phải "▲"/"▼", và cũng không phải số 0 trần: con số đã được làm
// tròn một chữ số ở producer, nên "đứng yên" ở đây nghĩa là DƯỚI NGƯỠNG ĐỌC
// ĐƯỢC, không phải bằng đúng không. `deltaTone` đã trả "neutral" cho 0, nên
// badge tự ra nền xám và không cạnh tranh với thẻ có chuyện thật để báo.
export function deltaGlyph(delta: number | undefined): string {
  if (delta === undefined) return "";
  if (delta === 0) return "≈";
  return delta > 0 ? "▲" : "▼";
}

/**
 * The format of a metric, from the served vocabulary alone. The front end holds
 * no metric knowledge of its own (no name patterns, no money list): a metric the
 * vocabulary does not know, or any metric before it has loaded, reads as a
 * plain "number". A slot's own `config.format` is applied by the callers and
 * always wins over this.
 */
export function columnFormatFor(metric?: string): ColumnFormat {
  return servedMetricFormat(metric) ?? "number";
}

/**
 * Whether a metric cannot be summed across rows (a ratio, or a de-duplicated
 * count such as reach), read from the vocabulary's `additive` flag. Only an
 * explicit `additive: false` counts: an unknown metric is treated as additive,
 * so nothing is withheld on a guess. Such a metric has no "share of total",
 * which is why pie_chart is dropped from the widget switcher for it (see
 * applyChartView in lib/dashboard/chartView).
 */
export function isNonAdditiveMetric(metric?: string): boolean {
  if (!metric) return false;
  return metricMeta(metric)?.additive === false;
}

// Thứ tự ưu tiên, đúng ba bậc: `unit` tường minh > `format` do producer khai
// báo > suy luận theo tên metric. Bậc giữa là thay đổi 2026-09-17: thẻ KPI đọc
// đúng cái format mà cột bảng đọc, thay vì phân loại lại lần thứ hai — hai
// bảng phân loại là lý do completion_rate 6.32 in "6.32%" ở bảng và "6" ở thẻ
// ngay cạnh (lệch cả 7 metric `*_rate` và `purchase_roas`). Bậc cuối chỉ còn
// đỡ cho board đã lưu từ trước, vốn không mang `format`.
export function formatMetric(
  value: number,
  metric?: string,
  unit?: string,
  format?: ColumnFormat,
  currency?: string,
): string {
  if (unit) return `${num(value, 2)}${unit}`;
  // A metric the vocabulary measures in "times" (ROAS) keeps its "x" suffix
  // ("2.60x"): the card's own presentation rule, ABOVE `format` rather than a
  // format of its own — the producer stamps `ratio` for it, so returning
  // `formatByColumn(value, format)` would swallow the "x". Every other metric
  // renders exactly as its column does.
  if (servedTimesUnit(metric)) return `${value.toFixed(2)}x`;
  return formatByColumn(value, format ?? columnFormatFor(metric), currency);
}

/**
 * The symbol a money figure is printed with, from the slot's ISO currency.
 *
 * `$` was hard-coded, so a VND or THB account read its spend in dollars
 * (fix-plan §2.1, DB-001/007/008/009). The producer now stamps
 * `config.currency` on every data slot; absent (a board saved before that) or
 * USD keeps `$`, so nothing an existing board shows changes. An unknown code
 * prints as itself ("XYZ 1,234.00") rather than as someone else's symbol.
 */
export function currencySymbol(currency?: string, locale = "en"): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (!code || code === "USD") return "$";
  const partOf = (currencyDisplay: "narrowSymbol" | "symbol"): string | undefined =>
    new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay })
      .formatToParts(0).find((x) => x.type === "currency")?.value;
  try {
    const narrow = partOf("narrowSymbol");
    // A bare "$" for a non-USD currency (TWD, CAD...) would read as dollars:
    // take the locale's regular symbol ("NT$") instead.
    return narrow === "$" ? (partOf("symbol") ?? `${code} `) : (narrow ?? `${code} `);
  } catch {
    return `${code} `;
  }
}

/** The formats the served vocabulary names that this renderer draws. */
const SERVED_FORMATS: Record<string, ColumnFormat> = {
  money: "money",
  percent: "percent",
  ratio: "ratio",
  number: "number",
};

/** A describe `format` name as the column format this renderer draws, or
 *  undefined for one it does not know. */
export function servedFormat(name?: string | null): ColumnFormat | undefined {
  return name ? SERVED_FORMATS[name] : undefined;
}

/**
 * The format the served vocabulary declares for `metric`, or undefined when it
 * declares none this renderer knows (or the vocabulary has not loaded yet).
 */
export function servedMetricFormat(metric?: string): ColumnFormat | undefined {
  if (!metric) return undefined;
  const served = metricMeta(metric)?.format;
  return served ? SERVED_FORMATS[served] : undefined;
}

/**
 * Whether the served vocabulary measures `metric` in "times" (a multiple, as
 * ROAS is), which the card prints with an "x" suffix. False for any metric the
 * vocabulary does not state a unit for, and before it has loaded.
 */
export function servedTimesUnit(metric?: string): boolean {
  return !!metric && metricMeta(metric)?.unit === "times";
}

/**
 * ONE reading of a board value, for the board's widgets (BUG-102-RD-X-04):
 * KPI, table, distribution, pie, funnel, line and heatmap all print a figure
 * through this, so the same Spend reads the same everywhere on the board.
 *
 * Priority, four tiers: an explicit `unit` > the `format` the producer declared
 * > the format the served vocabulary declares for the metric > the legacy
 * name inference (`columnFormatFor`). A metric the vocabulary measures in "times" (ROAS) keeps its
 * "x", as on the card — other ratios print bare.
 *
 * Deliberately a new entry point: `formatMetric` and `formatByColumn` keep
 * their three-tier behaviour for every other caller (the alert line, the
 * drivers panel, CSV export).
 *
 * `spec.currency` is the slot's ISO currency, and it only ever reaches the
 * MONEY branch of `formatByColumn` — the tiers above it are units, ROAS and
 * percentages, none of which carry one. Absent, `formatByColumn` keeps its own
 * default, so a board saved before the producer stamped `config.currency`
 * prints exactly what it printed before.
 */
export function formatBoardValue(
  value: number,
  spec: { metric?: string; unit?: string; format?: ColumnFormat; currency?: string } = {},
): string {
  if (spec.unit) return `${num(value, 2)}${spec.unit}`;
  if (servedTimesUnit(spec.metric)) return `${value.toFixed(2)}x`;
  const format = spec.format ?? servedMetricFormat(spec.metric) ?? columnFormatFor(spec.metric);
  // A plain number with a fraction (frequency 2.09) keeps two decimals rather
  // than rounding to an integer that hides the movement; counts are whole, so
  // they print as before.
  if (format === "number" && typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value) && Math.abs(value) < 1000) {
    return num(value, 2);
  }
  return formatByColumn(value, format, spec.currency);
}

/**
 * Which metric each drawn line series is, keyed by series NAME — so its
 * tooltip and legend read in that metric's format.
 *
 * Each series' own `metric` when every series states one (a COMPARE cell of
 * several metrics over several accounts draws more series than its binding
 * lists metrics). Otherwise only where the binding says so unambiguously: a
 * multi-metric binding whose list matches the series one to one, or a single
 * metric every series shares (one metric broken down by campaign). Anything
 * else maps nothing, and those series print exactly as before. Keyed by name,
 * not position, because the plot may cap the series it draws.
 */
export function seriesMetricNames(
  series: readonly { name: string; metric?: string }[],
  binding?: WidgetBinding | { metric?: string; metrics?: string[] },
): Record<string, string> {
  if (series.length > 0 && series.every((s) => typeof s.metric === "string" && s.metric.length > 0)) {
    return Object.fromEntries(series.map((s) => [s.name, s.metric as string]));
  }
  const metrics = bindingMetrics(binding).filter((m) => m.length > 0);
  if (metrics.length > 1) {
    if (metrics.length !== series.length) return {};
    return Object.fromEntries(series.map((s, i) => [s.name, metrics[i]]));
  }
  const one = metrics[0];
  return one ? Object.fromEntries(series.map((s) => [s.name, one])) : {};
}

/**
 * A share or a rate that is ALREADY a percent (33.3 → "33.30%"), at the board's
 * one precision for percentages. Display only: the number is printed as given,
 * never recomputed or rescaled.
 */
export function formatPercentValue(value: number): string {
  // A malformed payload can omit a share; that prints nothing rather than
  // throwing inside a render (the old `${share}%` printed "undefined%").
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "";
}

// Định dạng theo kiểu cột của table.
export function formatByColumn(
  value: string | number, format: ColumnFormat = "number", currency?: string,
): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "money":
      // ĐÚNG hai chữ số thập phân, luôn luôn. `num(value, 2)` chỉ đặt TRẦN
      // (`maximumFractionDigits`), không đặt sàn, nên số 0 ở cuối bị cắt và
      // cùng một cột tiền hiện ra `$757.7` cạnh `$25.26` — số chữ số thay đổi
      // theo DỮ LIỆU chứ không theo quy tắc (đo 2026-09-19 trên hàng thẻ KPI).
      // Phần trăm và ratio ngay dưới đây dùng `toFixed(2)` nên vẫn đệm số 0;
      // tiền là loại duy nhất lệch khỏi quy ước đó, mà tiền lại là loại có quy
      // ước chặt nhất: xu luôn viết hai chữ số.
      // A non-zero price that four places would still print as $0.0000 says
      // how small it is instead of reading as no change (2026-09-25: a
      // cost-per-reach change of −$0.00002 chipped as "$0.00").
      if (value !== 0 && Math.abs(value) < MONEY_FLOOR) return `<${currencySymbol(currency)}${MONEY_FLOOR}`;
      return `${currencySymbol(currency)}${money(value, currency)}`;
    case "percent":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return `${value.toFixed(2)}`;
    case "duration":
      return formatMinutes(value);
    case "text":
      return String(value);
    default:
      return num(value);
  }
}

/**
 * Một ô DỮ LIỆU (`<tbody>`) đọc ra thành chữ.
 *
 * Dùng chung giữa `Cell` và bản xuất CSV, để "CSV khớp màn hình" đúng do hai
 * bên gọi cùng một hàm chứ không do hai đoạn code tình cờ giống nhau.
 *
 * `null` VÀ `undefined` → ô RỖNG. Đây là hành vi `Cell` vốn đã có từ trước, và
 * nó KHÁC dòng tổng — xem `totalCellText` ngay bên dưới, nơi `null` được đọc
 * theo cách khác. Hai hàm chứ không phải một hàm với cờ boolean, vì đây là hai
 * quy tắc hiển thị khác nhau chứ không phải hai chế độ của một quy tắc.
 *
 * Tham số là `unknown` chứ không phải `string | number` như `TableRow` khai
 * báo: `TableRow` là kiểu compile-time, còn dữ liệu producer gửi xuống không
 * được validate ở runtime — `Cell` đã phải tự chặn `null` từ trước khi có hàm
 * này.
 */
export function cellText(raw: unknown, format?: ColumnFormat, currency?: string): string {
  if (raw === undefined || raw === null) return "";
  return typeof raw === "number" ? formatByColumn(raw, format, currency) : String(raw);
}

/**
 * Một ô DÒNG TỔNG (`<tfoot>`) đọc ra thành chữ.
 *
 * Khác `cellText` đúng ở `null`, và sự khác nhau đó là CỐ Ý GIỮ LẠI: biểu thức
 * mà `<tfoot>` dùng từ trước chỉ chặn `undefined`, nên một `total_row` do
 * producer gửi xuống mang `null` được vẽ ra thành chữ "null" trên màn hình.
 * Sửa điều đó là một thay đổi giao diện, và nó không thuộc phạm vi Export CSV —
 * nên hàm này tái lập nguyên văn hành vi cũ:
 *
 *   undefined → ""   ·   null → "null"   ·   number → formatByColumn   ·   còn lại → String
 *
 * Bản xuất CSV gọi chính hàm này cho dòng tổng, nên file vẫn đọc ra đúng thứ
 * `<tfoot>` đang hiển thị, kể cả ở trường hợp "null" đó.
 */
export function totalCellText(raw: unknown, format?: ColumnFormat, currency?: string): string {
  if (raw === undefined) return "";
  return typeof raw === "number" ? formatByColumn(raw, format, currency) : String(raw);
}

/**
 * Minutes as a reading a person scans, not as a count.
 *
 * "1,745" is a number nobody converts in their head; "1d 5h" is the fact. Two
 * units at most — a third is noise at the scale a follow-up queue is read at —
 * and the value stays a NUMBER in the row so its threshold still works.
 */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  if (hours < 24) {
    const rest = total % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/** A plain number, grouped by thousands (en-US), at most `maxFrac` decimals —
 *  what a `number` column prints (`formatByColumn(v)` is `num(v)`). Exported so a
 *  widget with no column format prints a figure exactly as a table would. */
export function num(v: number, maxFrac = 0): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

// Tiền: nhóm hàng nghìn, và ĐÚNG hai chữ số thập phân.
//
// Sàn và trần cùng bằng 2 — `maximumFractionDigits` một mình chỉ chặn trên,
// nên `757.70` in ra `757.7`. Một cột tiền mà số chữ số thập phân nhảy theo
// giá trị thì không đọc so sánh được, và với `tabular-nums` thì dấu thập phân
// cũng không còn thẳng hàng.
function money(v: number, currency?: string): string {
  // A per-person cost (cost per reach ≈ $0.0108) rounds to "$0.01" at two
  // places, so a week that moved it 1% read "$0.01 → $0.01" (QA 2026-09-25).
  // Under a dime the figure keeps four places; everything else keeps the
  // currency's own places (ISO 4217 via Intl: VND/JPY 0, USD 2) — the same
  // table CLUEGA_AI_CDP `analysis/hourly/render.py` `money_places` uses.
  const base = currencyPlaces(currency);
  const places = base > 0 && v !== 0 && Math.abs(v) < SUB_DIME ? 4 : base;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

function currencyPlaces(currency?: string): number {
  if (!currency) return 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * A money amount at the board's precision WITHOUT a symbol — for a figure whose
 * currency the slot does not state, where `formatByColumn` would print `$`
 * (its default for boards saved before `config.currency`) and so name a
 * currency nobody declared.
 *
 * The SAME two rules as `formatByColumn`'s money branch, from the same
 * `money()` and `MONEY_FLOOR`: two places (four under a dime), and a non-zero
 * amount under the floor says how small it is ("<0.0001") instead of reading
 * as zero. A slot that states its currency goes through `formatByColumn`.
 */
export function formatMoneyAmountNoSymbol(value: number): string {
  if (value !== 0 && Math.abs(value) < MONEY_FLOOR) return `<${MONEY_FLOOR}`;
  return money(value);
}

const SUB_DIME = 0.1;
const MONEY_FLOOR = 0.0001;

/**
 * Một delta phần trăm, đọc thành chữ trên badge.
 *
 * In ĐÚNG độ chính xác producer gửi, không đệm thêm: `_comparison_config` làm
 * tròn 2 chữ số (cố ý — một RATIO dịch chuyển ít hơn nhiều so với tử và mẫu
 * của nó, và làm tròn 1 chữ số từng biến frequency thành 0.0 phẳng cạnh ba thẻ
 * có mũi tên), nên `3.75` ra "3.75%" còn `6` ra "6%".
 *
 * Hàm này tồn tại KHÔNG phải để đổi cách làm tròn mà để ba chỗ in cùng một
 * loại số — WindowsBody, thân thẻ KPI, MediaCard — không thể lệch nhau: quy
 * tắc "pt" cho percentage_point trước đây được chép tay ở hai nơi và thiếu ở
 * nơi thứ ba.
 */
export function formatDeltaPct(delta: number, unit?: string, fractionDigits?: number): string {
  // `fractionDigits` is opt-in: the board's KPI card passes 2, the one
  // precision a board prints percentages at (BUG-102-RD-X-04). Omitted — the
  // media card — the producer's own precision is printed, as before.
  const magnitude = fractionDigits === undefined ? Math.abs(delta) : Math.abs(delta).toFixed(fractionDigits);
  return `${magnitude}${unit === "percentage_point" ? "pt" : "%"}`;
}

// funnel: tỷ lệ chuyển đổi từng tầng so với tầng trước (tầng đầu = 1).
/**
 * Each stage's rate as a FRACTION, or null where the funnel states none.
 *
 * Two readings, and which one applies is the producer's to say. When it has
 * declared its denominators (`rates_declared`) every rate is read off the stage
 * that owns it, and a stage that declares none gets null — the renderer then
 * prints nothing rather than a number the funnel cannot stand behind.
 *
 * Without that flag this divides by the stage above, which is what every board
 * stored before the producer declared anything has been showing. It is right
 * for a chain (impressions → clicks → conversions) and wrong the moment a
 * ladder stops being one: `units_sold / orders` is items per order, and a
 * basket of more than one item printed it as a conversion rate over 100%.
 */
export function funnelRates(
  stages: FunnelStage[], declared = false,
): (number | null)[] {
  if (declared) {
    return stages.map((s) =>
      typeof s.rate === "number" && Number.isFinite(s.rate) ? s.rate / 100 : null,
    );
  }
  return stages.map((s, i) => {
    if (i === 0) return 1;
    const prev = stages[i - 1].value;
    return prev > 0 ? s.value / prev : 0;
  });
}

// table total row: số cộng dồn được (money/number) tính tổng; tỷ lệ (percent/ratio) KHÔNG
// cộng dồn trừ khi khai báo `derived` (Σnum/Σden) — cộng thẳng ROAS/CTR của nhiều dòng vô nghĩa.
const ADDITIVE_FORMATS: Record<string, true> = { money: true, number: true };

export function computeTotalRow(rows: TableRow[], columns: TableColumn[]): TableRow {
  const total: TableRow = {};
  for (const col of columns) {
    if (col.derived) {
      const sumNum = sumBy(rows, col.derived.num);
      const sumDen = sumBy(rows, col.derived.den);
      total[col.key] = sumDen > 0 ? (sumNum / sumDen) * (col.derived.scale ?? 1) : 0;
    } else if (col.format && ADDITIVE_FORMATS[col.format]) {
      total[col.key] = sumBy(rows, col.key);
    }
  }
  return total;
}

function sumBy(rows: TableRow[], key: string): number {
  let s = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number") s += v;
  }
  return s;
}

export function meetsCondition(value: number, cond?: { op: ConditionOp; value: number }): boolean {
  if (!cond) return false;
  switch (cond.op) {
    case "lt": return value < cond.value;
    case "lte": return value <= cond.value;
    case "gte": return value >= cond.value;
    default: return value > cond.value;
  }
}

/** What a resolved right axis gives the chart. */
export interface RightAxisPlan {
  /** Index of the series that moves. Never -1 — a miss yields `null` instead. */
  index: number;
  /** How an axis TICK reads: scanned, so one decimal. */
  formatTick: (value: number) => string;
  /** How a READING reads — a tooltip or a legend, so two. */
  formatValue: (value: number, currency?: string) => string;
}

/**
 * Resolve a declared right axis against the series actually being drawn.
 *
 * `null` — and therefore a single-axis chart — in three cases, all of which
 * are the safe answer:
 *   · nothing declared, which is every chart before this existed;
 *   · a series name this chart does not draw, because a line silently attached
 *     to a scale built for a different unit is worse than no second axis;
 *   · a chart with fewer than two series, where a second axis would separate
 *     a line from nothing.
 *
 * Pure and outside the canvas component so all of it is assertable: a chart
 * drawn on a canvas renders no markup a test could read.
 */
/**
 * How the right axis prints its own unit.
 *
 * The axis exists because the series on it is measured in something the left
 * axis is not, so printing it in the left axis's terms defeats the opt-in. It
 * was `"ratio"` or nothing, and nothing meant `formatCompact` — which was
 * correct while `roas` was the only series anyone put there. The producer now
 * emits `right_axis` for any ratio whose parents are off-chart, so a
 * `cost_per_*` reached the axis and printed `13.3` for `$13.28`: a price with
 * its currency removed, on the one axis whose whole purpose is its unit.
 *
 * `money` and `percent` values match `formatByColumn`, so a figure reads the
 * same on this axis as in a table cell; `ratio` keeps the `x` this axis has
 * always printed, which is what `formatMetricValue` does for roas. Ticks use
 * the compact form because an axis has ~40px per label, and `formatCompact`
 * takes the currency as a prefix rather than hardcoding one per call site.
 */
export type RightAxisFormat = "ratio" | "money" | "percent";

const RIGHT_AXIS_FORMATTERS: Record<
  RightAxisFormat | "none",
  { formatTick: (v: number) => string; formatValue: (v: number, currency?: string) => string }
> = {
  ratio: {
    formatTick: (v) => `${v.toFixed(1)}x`,
    formatValue: (v) => `${v.toFixed(2)}x`,
  },
  money: {
    formatTick: (v) => formatCompact(v, "$"),
    // `formatByColumn(v, "money")`, không phải một cách viết thứ hai của cùng
    // quy tắc — docstring ngay trên khẳng định "reads the same on this axis as
    // in a table cell", và hai chuỗi giống nhau vì tình cờ là cách chúng bắt
    // đầu lệch: khi tiền chuyển sang đệm đúng hai chữ số, chỗ này còn cắt số 0
    // và test đó bắt được ngay.
    formatValue: (v, currency) => formatByColumn(v, "money", currency),
  },
  percent: {
    formatTick: (v) => `${v.toFixed(1)}%`,
    formatValue: (v) => `${v.toFixed(2)}%`,
  },
  // Absent — every chart that declared no format before this existed. Unchanged.
  none: { formatTick: formatCompact, formatValue: formatCompact },
};

export function rightAxisPlan(
  series: ReadonlyArray<{ name: string }>,
  rightAxis?: { series: string; format?: RightAxisFormat },
): RightAxisPlan | null {
  if (!rightAxis || series.length < 2) return null;
  const index = series.findIndex((s) => s.name === rightAxis.series);
  if (index < 0) return null;
  return { index, ...RIGHT_AXIS_FORMATTERS[rightAxis.format ?? "none"] };
}

/**
 * How many series a line chart draws.
 *
 * Three, and the cap is a reading rule rather than a technical one: the widget
 * is themed with three series colours, and a fourth line on one scale is a
 * fourth thing to hold in mind while comparing the first three.
 */
export const LINE_SERIES_MAX = 3;

/**
 * Four, and ONLY for a chart that really does read one of them against a
 * second scale.
 *
 * The cap exists because four lines on ONE axis is a thicket. A dual-axis
 * chart is not that: three of its lines share a scale and the fourth is a
 * ratio somewhere else entirely, which is nearer to two charts stacked than to
 * four lines competing. The Website Sales trend is the case — revenue, net
 * revenue and spend in dollars, ROAS between 2 and 4 — and dropping one of
 * them to fit a three-line cap threw away either the net figure or, worse,
 * ROAS itself, which would have taken the second axis away with it.
 */
export const LINE_SERIES_MAX_DUAL_AXIS = 4;

/** One drawn line: where its colour comes from, and which scale it is read against. */
export interface LineTrack {
  /**
   * The palette slot this line is stroked from. Equal to the line's own index
   * for the first three, so a legacy chart is coloured exactly as before.
   */
  colorIndex: number;
  /**
   * The scale, named EXPLICITLY — or absent on a single-axis chart, where the
   * key must not be added at all. Chart.js assigns an unnamed dataset to the
   * first y scale in the options object's key order, which is a thing no
   * reader of a board should depend on: it once put every money line on the
   * ratio axis and left the money axis empty.
   */
  axis?: "y" | "y1";
  /** The line's own stroke (a COMPARE account's colour), which wins over the palette slot. */
  color?: string;
}

/** The whole drawing decision for a line chart, made once and read twice. */
export interface LineSeriesPlan<S> {
  /** The series actually drawn, in the producer's own order. */
  series: S[];
  /** `tracks[i]` belongs to `series[i]`. */
  tracks: LineTrack[];
  /** The right axis, or `null` on a single-axis chart. */
  right: RightAxisPlan | null;
}

/**
 * Which series a line chart draws, in what colour, against which scale.
 *
 * Pure, and used by the plot for BOTH its datasets and its legend, so a test
 * exercises the same decision the canvas does — a chart draws no markup a test
 * could read, and a helper the component does not call proves nothing.
 *
 * The cap is decided by whether a right axis RESOLVES, and the resolution runs
 * against the four-series window rather than the three-series one. Getting
 * that order wrong is what made the field look like it worked while quietly
 * dropping the very series it was declared for.
 *
 * Every way the declaration can fail falls back to the single-axis chart:
 * three series, no `yAxisID` on any dataset, and no empty second scale.
 */
export function lineSeriesPlan<S extends { name: string; color?: string }>(
  all: ReadonlyArray<S>,
  rightAxis?: { series: string; format?: RightAxisFormat },
): LineSeriesPlan<S> {
  // Lines the renderer coloured (one per COMPARE account, up to six plus a
  // total) are told apart by their own colours, so neither the cap nor the
  // second axis applies to them.
  if (all.some((s) => s.color)) {
    return {
      series: [...all],
      tracks: all.map((s, i) => ({ colorIndex: i < LINE_SERIES_MAX ? i : 0, ...(s.color ? { color: s.color } : {}) })),
      right: null,
    };
  }
  // Resolve against the WIDE window: a chart may declare its right-axis series
  // fourth, and looking for it in the first three would not find it.
  const right = rightAxisPlan(all.slice(0, LINE_SERIES_MAX_DUAL_AXIS), rightAxis);
  const series = all.slice(0, right ? LINE_SERIES_MAX_DUAL_AXIS : LINE_SERIES_MAX);
  return {
    series,
    tracks: series.map((_, i) => ({
      // The fourth line reuses the FIRST colour. It is told apart by its
      // stroke — the finely dotted [2,3] no other line uses — by its legend
      // row, which names its axis in words, and by the fact that it is drawn
      // against a scale the money lines never touch. A fourth hue would have
      // to be quiet enough not to compete with the semantic red and loud
      // enough to read on both grounds, and the palette has no such slot: its
      // fourth entry is a donut ramp step at roughly 1.5:1 against either
      // background.
      colorIndex: i < LINE_SERIES_MAX ? i : 0,
      ...(right ? { axis: i === right.index ? ("y1" as const) : ("y" as const) } : {}),
    })),
    right,
  };
}

/**
 * Where a line stops being a MEASUREMENT and starts being a projection.
 *
 * `-1` means nowhere: the field was not declared, or the label it names is not
 * in this window. Both read as "every point was measured", which is what every
 * chart drew before the field existed.
 *
 * Matched by LABEL rather than by position so it survives a window that starts
 * somewhere else — a curve re-cut from D3 must still know that D60 is the
 * first modelled day.
 */
export function forecastIndexOf(
  labels: Array<string | number>,
  forecastFromX?: string | number,
): number {
  if (forecastFromX === undefined) return -1;
  return labels.findIndex((label) => String(label) === String(forecastFromX));
}

/** The Chart.js dataset options that DRAW a projection. */
export interface ForecastDecoration {
  segment?: { borderDash: (ctx: { p1DataIndex: number }) => number[] | undefined };
  pointBackgroundColor?: string[];
  pointBorderColor?: string;
  pointBorderWidth?: number;
}

/**
 * Dashed from the first projected segment, hollow from the first projected
 * point. Two signals, because a reader who takes a forecast for a measurement
 * will report it as one.
 *
 * `index >= from`, and `from` may be ZERO — a curve modelled end to end is a
 * real thing (a run made before any cohort has matured), and treating index 0
 * as "no forecast" drew exactly that as measured data. Only `-1` switches the
 * decoration off, and then this returns an EMPTY object so the dataset it is
 * spread into is byte-identical to one built before this existed.
 *
 * Pure and outside the canvas component so all of it is assertable in a test:
 * a chart drawn on a canvas renders no markup to check.
 */
export function forecastDecoration(
  from: number,
  pointCount: number,
  stroke: string,
  /** The canvas ground a hollow point is filled with. Falls back to the stroke
   *  — a filled point — rather than to a colour literal. */
  ground: string | undefined,
): ForecastDecoration {
  if (from < 0) return {};
  return {
    segment: {
      borderDash: (ctx: { p1DataIndex: number }) =>
        ctx.p1DataIndex >= from ? [5, 4] : undefined,
    },
    pointBackgroundColor: Array.from({ length: pointCount }, (_v, i) =>
      i >= from ? (ground ?? stroke) : stroke,
    ),
    pointBorderColor: stroke,
    pointBorderWidth: 1.5,
  };
}

/**
 * The threshold that applies to ONE cell.
 *
 * A column normally has one, and that is what every table before this uses. A
 * column may instead declare that its threshold depends on another cell of the
 * same row — one CPI column with a different ceiling per operating system —
 * and then the row picks the case. First match wins; no match, and no
 * segment-aware declaration at all, falls back to the column's own.
 *
 * One function so the CELL tint and the ROW mark can never disagree about
 * which rule applied: they both call this.
 */
export function conditionFor(
  col: Pick<TableColumn, "conditional" | "conditional_by">,
  row: TableRow,
): { op: ConditionOp; value: number } | undefined {
  const by = col.conditional_by;
  if (by) {
    const discriminator = row[by.column];
    const hit = by.cases.find((c) => c.when === String(discriminator));
    if (hit) return { op: hit.op, value: hit.value };
  }
  return col.conditional;
}

/**
 * Whether ONE cell breaches its column's rule: `true`, `false`, or `null` when
 * the producer could not judge it (review W2).
 *
 * A row that carries `flags` is read from them and nothing else. The producer
 * judged the rule there — including "N days in a row", which the cell cannot
 * answer, because the cell holds the window figure and a spiky week can top the
 * threshold without ever holding it for N days. A key the flags do not name has
 * no rule on it. Only a row without `flags` (a board saved before them) is
 * judged here from the cell.
 *
 * One function so the CELL tint and the ROW mark can never disagree.
 */
export function cellVerdict(
  col: Pick<TableColumn, "key" | "conditional" | "conditional_by">,
  row: TableRow,
): boolean | null {
  const flags = row.flags;
  if (flags && typeof flags === "object") {
    const verdict = flags[col.key];
    return verdict === true || verdict === null ? verdict : false;
  }
  const raw = row[col.key];
  return typeof raw === "number" && meetsCondition(raw, conditionFor(col, row));
}

/** Paint the cell only on a breach: an unjudged cell is not painted, and is not
 *  a pass either — `cellVerdict` keeps that difference for whoever needs it. */
export function cellBreaches(
  col: Pick<TableColumn, "key" | "conditional" | "conditional_by">,
  row: TableRow,
): boolean {
  return cellVerdict(col, row) === true;
}

// Rút gọn số lớn theo chuẩn thị giác: donut center "$18,420" → "$18.4k" khi hẹp.
// Bỏ ".0" để không hiện "18.0k".
export function formatCompact(value: number, prefix = "", fractionDigits = 1): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  let div = 1;
  let suffix = "";
  if (abs >= 1_000_000) { div = 1_000_000; suffix = "M"; }
  else if (abs >= 1_000) { div = 1_000; suffix = "k"; }
  let v = +(abs / div).toFixed(fractionDigits);
  // Làm tròn có thể đẩy giá trị lên bậc kế tiếp: 999_950 → "1000k" thay vì "1M".
  if (v >= 1000 && suffix === "k") { v = +(abs / 1_000_000).toFixed(fractionDigits); suffix = "M"; }
  else if (v >= 1000 && suffix === "") { v = +(abs / 1_000).toFixed(fractionDigits); suffix = "k"; }
  const body = Number.isInteger(v) ? String(v) : v.toFixed(fractionDigits);
  return `${v === 0 ? "" : sign}${prefix}${body}${suffix}`;
}

/**
 * The fewest decimals (1, then 2, then 3) at which every axis tick prints a
 * different `formatCompact` label. An axis spanning 2.08–2.12 at one decimal
 * printed "2.1" twice, which reads as a flat axis; a wider axis keeps the one
 * decimal it always had. Capped at 3: past that the ticks are not distinct
 * numbers worth telling apart. Display only, no metric knowledge.
 */
export function distinctTickDigits(ticks: readonly number[]): number {
  const distinct = [...new Set(ticks)];
  for (let digits = 1; digits < 3; digits++) {
    const labels = new Set(distinct.map((t) => formatCompact(t, "", digits)));
    if (labels.size === distinct.length) return digits;
  }
  return 3;
}

// Giá trị ĐẦY ĐỦ, nhóm hàng nghìn — donut center (§7.3) hiện nguyên "$18,420", không
// rút gọn: formatCompact() ở trên chỉ dành cho biến thể HẸP (đúng như doc "khi hẹp"
// của nó) hoặc nhãn cuối đường line_chart — chưa có công tắc theo bề rộng card nên
// donut center dùng thẳng hàm này làm mặc định. Không tự ý làm tròn phần thập phân
// bằng cách cắt chuỗi — toLocaleString(maximumFractionDigits:0) làm tròn số học đúng
// (18420.6 → "18,421"), không hiện thập phân lẻ tẻ.
export function formatFullNumber(value: number, prefix = ""): string {
  return `${prefix}${num(value)}`;
}

// x_axis là tuỳ chọn và thường vắng ở dữ liệu thật — quy đổi "2026-07-28" (ISO
// date trên series[].points[].x, dùng làm phương án dự phòng khi x_axis vắng)
// về dạng ngắn "28/7" của baseline. Giá trị không khớp mẫu ISO date (vd trục x
// là index số) thì trả về nguyên trạng.
export function shortenAxisLabel(x: string | number): string {
  const s = String(x ?? "");
  return isIsoDayShape(s) ? `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}` : s;
}

// Cắt GIỮA cho nhãn phân loại dài (tên quảng cáo trên trục x của bar_chart).
// Giữ cả đầu lẫn đuôi quanh dấu "…" vì phần phân biệt có thể nằm ở hai phía:
// "Doanh số bán hàng20260813154549" (đầu) và "Unnamed ad 2/3/4/5" (đuôi) —
// cắt-đuôi thường sẽ gộp cả bốn "Unnamed …" thành một, còn cắt-giữa giữ được
// "Unn…d 2" vs "Unn…d 3". maxChars TÍNH tổng cả dấu "…".
export function middleTruncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars === 1) return "…";
  const keep = maxChars - 1; // trừ chỗ cho dấu "…"
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return text.slice(0, head) + "…" + (tail > 0 ? text.slice(text.length - tail) : "");
}

// ── Nhãn thực thể: giữ phần PHÂN BIỆT ────────────────────────────────────────
//
// Mọi widget vẽ một danh sách tên thực thể (legend donut, trục x bar, hàng
// ranking, nhãn hàng heatmap, nhãn điểm scatter) đều rút gọn — và đều rút gọn
// SAI theo cùng một kiểu khi các tên chia nhau một tiền tố. Đo 2026-09-21 trên
// board TikTok Lead Gen:
//
//   legend donut   "Lead Gen · Instant F…" ×4, các phần trăm 13/13/13/12
//   trục x bar     "Lead…p 4" xuất hiện HAI lần — `Instant Form · Ad group 4`
//                  và `VN · Ad group 4` cắt ra đúng một chuỗi
//
// Một chuỗi mà MỌI nhãn trong hình đều mang thì không phân biệt được gì trong
// hình đó; nó chỉ lấy mất chỗ của phần thật sự phân biệt. Cắt nó ở đây, và chỉ
// ở đây: tooltip, `title` và bản xuất ra CSV vẫn mang tên ĐẦY ĐỦ, vì ở đó nhãn
// phải định danh được ra ngoài phạm vi một biểu đồ.
//
// Cắt tại DẤU PHÂN CÁCH, không theo ký tự: tiền tố chung của "Lead Gen VN" và
// "Lead Gen · Instant Form" là "Lead Ge", cắt ra sẽ để lại "n VN".
const LABEL_SEPARATORS = [" · ", " "];
/** What a cut label may still open with: the rest of a separator, besides whitespace. */
const SEPARATOR_REST = "·:|–—-";
const LABEL_KEEP_MIN = 3;

/**
 * Mọi nhãn đều là chuỗi. Board do model viết, và không gì phía trên bảo đảm
 * mỗi dòng đều có `label` — một nhóm gửi {name, value} tới đây thành
 * `undefined`, và `.includes` trên nó làm sập cả màn Pulse. Thiếu một tên thì
 * không cắt tiền tố nào; một nhãn trống vẫn hơn một màn hình lỗi.
 */
function allNamed(labels: readonly unknown[]): labels is string[] {
  return labels.every((label) => typeof label === "string");
}

/** Tiền tố chung theo ký tự của một mảng nhãn. "" nếu không có. */
function rawCommonPrefix(labels: string[]): string {
  let prefix = labels[0] ?? "";
  for (const label of labels) {
    let i = 0;
    while (i < prefix.length && i < label.length && prefix[i] === label[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (!prefix) return "";
  }
  return prefix;
}

/**
 * Những nhãn được tính vào tiền tố chung.
 *
 * Một danh sách thực thể thường kèm một Ô GỘP — "Other" / "Khác" / "Tổng" —
 * và ô đó không mang tiền tố nào cả, nên tính nó vào sẽ làm tiền tố chung rỗng
 * và cả cơ chế không kích hoạt: đúng trường hợp legend donut trong ảnh, nơi
 * lát thứ sáu là "Other" và bốn lát trên nó in ra một chuỗi giống hệt nhau.
 *
 * Phân biệt theo CẤU TRÚC chứ không theo chuỗi: một tên thực thể do producer
 * ghép lại luôn có dấu phân cách (" · "), một nhãn gộp thì không. Không đọc
 * i18n ở đây — locale của producer và của giao diện có thể khác nhau, và một
 * luật dựa trên chuỗi dịch sẽ im lặng ngừng hoạt động khi đổi ngôn ngữ.
 */
function prefixPool(labels: string[]): string[] {
  const structured = labels.filter((label) => label.includes(LABEL_SEPARATORS[0]));
  return structured.length >= 2 ? structured : labels;
}

/**
 * Bỏ phần đầu mà mọi nhãn CÓ CẤU TRÚC đều mang, chỉ khi mọi nhãn đó đều mang.
 *
 * Trả về mảng cùng độ dài, cùng thứ tự. Nhãn không mang tiền tố (ô gộp) giữ
 * nguyên. Không cắt khi: dưới hai nhãn, tiền tố không kết thúc ở một dấu phân
 * cách, hoặc có nhãn nào còn dưới ba ký tự sau khi cắt — nửa cắt nửa không là
 * cách chắc chắn khiến hai thực thể trông như cùng một loại tên.
 */
export function stripSharedPrefix(labels: string[]): string[] {
  if (labels.length < 2 || !allNamed(labels)) return labels;
  const pool = prefixPool(labels);
  if (pool.length < 2) return labels;
  const prefix = rawCommonPrefix(pool);
  if (!prefix) return labels;
  let cut = 0;
  for (const sep of LABEL_SEPARATORS) {
    const at = prefix.lastIndexOf(sep);
    if (at >= 0) {
      cut = Math.max(cut, at + sep.length);
      break;
    }
  }
  if (cut === 0) return labels;
  const affected = labels.filter((label) => label.startsWith(prefix.slice(0, cut)));
  if (affected.length < 2) return labels;
  if (affected.some((label) => label.length - cut < LABEL_KEEP_MIN)) return labels;
  // Phần thừa của dấu phân cách. Tiền tố chung của "Lead Gen VN · Ad group 4"
  // và "Lead Gen · Instant Form · Ad group 3" chỉ cắt được ở khoảng trắng sau
  // "Lead Gen", nên nhãn thứ hai còn lại "· Instant Form · Ad group 3" — mở đầu
  // bằng một dấu chấm giữa không thuộc về nó.
  return labels.map((label) => {
    if (!label.startsWith(prefix.slice(0, cut))) return label;
    let at = cut;
    while (at < label.length && (label[at].trim() === "" || SEPARATOR_REST.includes(label[at]))) at++;
    return label.slice(at);
  });
}

/**
 * Tiền tố chung mà `stripSharedPrefix` đã lấy đi, cắt ở dấu phân cách. "" nếu
 * không có.
 *
 * Cái bị cắt phải được in ĐÚNG MỘT LẦN trong thẻ — nếu không thì "Lead Gen ·
 * Instant Form" biến mất khỏi màn hình hoàn toàn, và người đọc mất một sự thật
 * về board thay vì được đọc nó gọn hơn.
 */
export function sharedLabelHead(labels: string[]): string {
  if (labels.length < 2 || !allNamed(labels)) return "";
  const pool = prefixPool(labels);
  if (pool.length < 2) return "";
  const prefix = rawCommonPrefix(pool);
  if (!prefix) return "";
  if (stripSharedPrefix(labels) === labels) return "";
  for (const sep of LABEL_SEPARATORS) {
    const at = prefix.lastIndexOf(sep);
    if (at > 0) return prefix.slice(0, at).trim();
  }
  return prefix.trim();
}

/**
 * A producer's own subtitle and the prefix `stripSharedPrefix` took off the
 * labels, on one line without reading as one sentence.
 *
 * NOT " · ". That is the separator INSIDE an entity name, so joining with it
 * produced "No Leads by ad group × day — showing Spend · Lead Gen" (measured
 * 2026-09-21), where the last two words read as part of the metric rather than
 * as the thing every row shares. An em dash separates two statements; a middle
 * dot separates the parts of one name, and the card carries both kinds of text.
 */
export function joinSubtitle(
  subtitle: string | undefined, head: string,
): string | undefined {
  return [subtitle, head].filter(Boolean).join(" — ") || undefined;
}

// Thu mỏng nhãn trục x để không chồng chéo ở bề rộng hẹp: hiện tối đa
// `maxLabels` nhãn, luôn giữ mốc đầu và mốc cuối. Trả về mảng CÙNG độ dài với
// đầu vào (nhãn bị ẩn thành null thay vì bị lọc bỏ) để vị trí trên trục — tính
// theo index gốc trong mảng — không bị lệch khi một số nhãn không hiển thị.
export function thinAxisLabels(labels: string[], maxLabels = 5): (string | null)[] {
  const last = labels.length - 1;
  const stride = Math.max(1, Math.ceil(labels.length / maxLabels));
  return labels.map((label, i) => {
    if (i === last) return label;
    // Mốc cuối LUÔN được giữ, nên một nhãn theo bước stride nằm sát nó sẽ chồng
    // lên nó: 14 ngày với budget 5 cho stride 3, giữ index 12 ("13/9") ngay
    // cạnh index 13 ("14/9") và trục in ra "13/914/9" (BUG-010). Nhãn theo
    // stride chỉ được giữ khi còn cách mốc cuối đủ một bước — thà mất một nhãn
    // ở gần cuối còn hơn hai nhãn dính nhau.
    return i % stride === 0 && last - i >= stride ? label : null;
  });
}

// Phút đã trôi qua kể từ mốc ISO. Trả null nếu không parse được (chuỗi người-đọc
// kiểu cũ) để WidgetShell bỏ qua footnote thay vì in rác.
export function relativeMinutes(iso: string, nowMs: number): number | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((nowMs - then) / 60_000));
}

/**
 * "How long ago", written out — the ONE formatter for the board's freshness
 * captions and the "My dashboards" cards.
 *
 * The two used to disagree about the same instant: the card rounded
 * (`Math.round`, 90 s → "2m") from inline copy, the board floored (90 s →
 * "1 min ago") from i18n keys and had no days. Now both floor, both read the
 * `dashboard.common.*` keys, and both go to days past 24 hours. `compact` is the
 * card's short form ("5m", "3h", "2d"); `long` is the board's sentence form
 * ("5 min ago"). Under a minute is "just now" in either.
 */
export type RelativeStyle = "compact" | "long";

export function formatRelative(
  minutes: number,
  t: (key: string) => string,
  style: RelativeStyle = "long",
): string {
  const mins = Math.max(0, Math.floor(minutes));
  if (mins < 1) return t("dashboard.common.justNow");
  const [unit, n] =
    mins < 60
      ? (["minutes", mins] as const)
      : mins < 24 * 60
        ? (["hours", Math.floor(mins / 60)] as const)
        : (["days", Math.floor(mins / (24 * 60))] as const);
  const key = style === "compact" ? `dashboard.common.relativeCompact.${unit}` : `dashboard.common.${unit}Ago`;
  return t(key).replace("{n}", String(n));
}

/**
 * Mốc `synced_at` MỚI NHẤT trong các slot — mốc cả bảng nói chung.
 *
 * Bảng có thể trộn nhiều nguồn và nhiều thời điểm đồng bộ. Một dòng "cập nhật
 * lúc" ở chân bảng chỉ trung thực nếu nó là mốc mới nhất: lấy mốc cũ nhất sẽ
 * nói bảng cũ hơn thực tế, còn lấy mốc đầu tiên gặp được thì phụ thuộc thứ tự
 * widget chứ không phụ thuộc dữ liệu.
 *
 * Bỏ qua slot không có `synced_at` và slot có chuỗi không parse được — cùng
 * quy tắc `relativeMinutes` áp dụng cho từng widget, nên chân bảng không bao
 * giờ in ra thứ mà widget đã từ chối in.
 *
 * Trả về chính CHUỖI ISO đó, không phải số ms: người gọi vẫn đưa nó qua
 * `relativeMinutes` với mốc `now` dùng chung, nên chân bảng và các widget tính
 * bằng đúng một phép tính.
 *
 * CỐ Ý KHÔNG phải `updated_at`: mốc đó nhảy mỗi khi bản ghi đổi — đổi tên bảng
 * cũng bump nó — và không nói gì về tuổi của các con số. Gắn nhãn `updated_at`
 * là độ mới dữ liệu sẽ khiến một bảng vừa đổi tên trông như vừa đồng bộ.
 *
 * ĐÂY LÀ BẢN DUY NHẤT. `lib/dashboard/preview.ts` từng có một bản riêng cho thẻ
 * preview; hai bản độc lập của cùng một quy tắc là hai chỗ để nó trôi khác
 * nhau, nên preview nay gọi hàm này. Nhà của nó là module thuần cấp thấp mà cả
 * widget lẫn preview đều đã phụ thuộc — không React, không vòng import.
 */
export function latestSyncedAt(
  slots: ReadonlyArray<{ synced_at?: string }>,
): string | null {
  let bestIso: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const slot of slots) {
    const iso = slot?.synced_at;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  return bestIso;
}

// Hai series lệch nhau ≥10× trên CÙNG một trục thì series nhỏ bị ép thành đường
// phẳng — người đọc hiểu sai là "không đổi". Phát hiện để ghi chú, KHÔNG thêm trục
// thứ hai (§7.3 chốt một trục).
const DIVERGENCE_FACTOR = 10;

export function seriesMagnitudesDiverge(series: LineSeries[]): boolean {
  const peaks = series
    // Ngày chưa có dữ liệu (y === null) không phải một đỉnh — bỏ ra khỏi phép so.
    .map((s) => Math.max(0, ...s.points.map((p) => p.y).filter((y): y is number => y !== null)))
    .filter((v) => v > 0);
  if (peaks.length < 2) return false;
  return Math.max(...peaks) / Math.min(...peaks) >= DIVERGENCE_FACTOR;
}

/**
 * WHICH footnote a line chart's bottom-right corner carries.
 *
 *   · `scalesDiffer` — the chart IS distorted. Two series >=10x apart share one
 *     axis, so the small one is pinned to the baseline and reads as "no change".
 *     The note points the reader at the end labels instead.
 *   · `hover` — nothing to disclose; the chart prints no note.
 *
 * Here rather than in JSX because getting it wrong is invisible: a warning
 * printed over an UNDISTORTED chart teaches the reader to ignore it.
 */
export type LineFootnote =
  | { kind: "scalesDiffer" }
  | { kind: "hover" };

export function lineFootnote(
  config: {
    panels?: boolean;
    right_axis?: { series: string; format?: RightAxisFormat };
  },
  series: LineSeries[],
  rows?: number,
): LineFootnote {
  // Panels first: each series has its own scale, so nothing is distorted and
  // nothing about the axis needs explaining.
  if (lineRendersAsPanels(config, series, rows)) return { kind: "hover" };
  if (seriesMagnitudesDiverge(series)) return { kind: "scalesDiffer" };
  return { kind: "hover" };
}

/**
 * The plot height, in px, below which a panel states nothing.
 *
 * Measured 2026-09-08 on a live board, and the number is why this guard exists
 * at all. A `line_chart` cell is `layout.h × 76` (`ROW_UNIT_PX` in
 * lib/dashboard/layoutEngine), and at the producer's default `h: 3` that is 228px:
 * minus the shell's padding, title and footnote row, ~158px of content. Split
 * three ways with `gap-2` that is ~47px per panel, and Chart.js's own top
 * padding left ~17px of drawing area — every line came out flat with a single
 * "0" tick, on an account whose spend really moved from 870 to 972.
 *
 * 56px is the floor a 7-point series needs to show a 10% move as something
 * other than a horizontal rule: three y ticks at 8px padding plus the 8px top
 * padding leave ~30px of plot, where 10% of the scale is ~3px of travel.
 */
const MIN_PANEL_PLOT_PX = 56;

/** What one grid unit of `layout.h` is worth to a line chart, in px — the
 *  layout engine's own row unit, so the split decision and the cell agree. */
const LINE_HEIGHT_UNIT_PX = ROW_UNIT_PX;

/** Shell chrome above and below the plot area: padding, title, footnote row. */
const LINE_CHROME_PX = 70;

/**
 * The stack's own legend row (`BarPanels` / `LinePanels` render one under the
 * panels, `mt-0.5` + a ~20px line).
 *
 * Missing from this arithmetic until 2026-09-21, so `panelsFitInRows` was
 * measuring a plot area 26px taller than the one the panels actually get —
 * always in the direction of splitting a cell that cannot hold the split.
 */
const PANEL_LEGEND_PX = 26;

/** Vertical `gap-2` between stacked panels. */
const PANEL_GAP_PX = 8;

/**
 * Do `count` panels fit readably in a cell `rows` grid units tall?
 *
 * Exported so the PRODUCER's height choice and the renderer's split decision
 * can be checked against one arithmetic instead of two — a producer that asks
 * for panels and grants three rows has asked for the flat lines above, and this
 * is the function that says so.
 */
export function panelsFitInRows(rows: number, count: number): boolean {
  if (count < 2) return false;
  const content = rows * LINE_HEIGHT_UNIT_PX - LINE_CHROME_PX - PANEL_LEGEND_PX;
  const perPanel = (content - PANEL_GAP_PX * (count - 1)) / count;
  return perPanel >= MIN_PANEL_PLOT_PX;
}

/**
 * Does this chart draw STACKED PANELS instead of one plot?
 *
 * Here rather than in the component for the same reason `lineSeriesPlan` is:
 * this is a reading decision, and a reading decision that lives in JSX cannot
 * be asserted. The precedence is the whole content of the function:
 *
 *   1. `panels: false` — the author asked for the old single plot. Honoured
 *      even when the magnitudes diverge; the footnote then says they do.
 *   2. A resolved `right_axis` — the narrow ratio-against-amounts case, which
 *      wants both lines in ONE frame. Panels would defeat its whole purpose,
 *      so a chart that declares a valid one never splits.
 *   3. No room — see `MIN_PANEL_PLOT_PX`. Three panels in a cell sized for one
 *      chart is three unreadable panels, which is worse than one readable line
 *      beside two flat ones and a footnote that says why. This rule outranks
 *      `panels: true` deliberately: a stored board carries the `h` it was
 *      saved with, and a producer that later starts asking for panels must not
 *      be able to flatten every board that predates its taller layout.
 *   4. `panels: true` — always, given something to separate and room for it.
 *   5. Otherwise automatic: split only when the magnitudes really diverge.
 *
 * Rule 2 is checked against the same window `lineSeriesPlan` resolves in, so
 * the two cannot disagree about whether a right axis exists. `rows` is the
 * slot's own `layout.h`; omitted, the caller is asserting the decision without
 * a cell (the tests do), and only the reading rules apply.
 */
export function lineRendersAsPanels(
  config: {
    panels?: boolean;
    right_axis?: { series: string; format?: RightAxisFormat };
  },
  series: LineSeries[],
  rows?: number,
): boolean {
  if (config.panels === false) return false;
  if (series.length < 2) return false;
  if (rightAxisPlan(series.slice(0, LINE_SERIES_MAX_DUAL_AXIS), config.right_axis)) return false;
  const count = Math.min(series.length, LINE_SERIES_MAX);
  if (rows !== undefined && !panelsFitInRows(rows, count)) return false;
  if (config.panels === true) return true;
  return seriesMagnitudesDiverge(series);
}

/**
 * Does this bar chart draw STACKED PANELS instead of one cluster?
 *
 * `lineRendersAsPanels`' precedence, minus the rung bars cannot take, plus the
 * one thing that makes the split more urgent here than there.
 *
 *   1. `panels: false` — the author pinned the cluster. Honoured.
 *   2. A resolved `right_axis` — that chart wants both series in one frame.
 *   3. No room (`panelsFitInRows`) — this outranks `panels: true`, because a
 *      stored board carries the `h` it was saved with and a producer that
 *      later starts asking for panels must not flatten every board older than
 *      its taller layout. Bars share the line chart's 76px row unit
 *      (`WIDGET_ROW_RULES` in lib/dashboard/layoutEngine), so the same floor applies; the
 *      chrome allowance is the line chart's, which is a few px generous here
 *      (no footnote row) and therefore errs toward NOT splitting.
 *   4. `panels: true` — the producer compared units, which is knowledge this
 *      side does not have.
 *
 * There is no automatic rung 5. A line chart can fall back on comparing
 * magnitudes because a line states its value as a POSITION; a bar states it as
 * a LENGTH from zero, so a cluster of mixed units is not merely hard to read,
 * it is a claim about relative size that the chart cannot support. Splitting on
 * magnitude alone would also split two comparable series that a reader wants
 * side by side — the very comparison a clustered chart is for. So the unit
 * question is answered where units are known, and this side only asks whether
 * there is room to honour the answer.
 *
 * `count` is the number of series in the cluster (the legend's length), and
 * `rows` the slot's own `layout.h`; omitted, the caller is asserting the
 * decision without a cell, and only the reading rules apply.
 */
export function barRendersAsPanels(
  config: {
    panels?: boolean;
    stacked?: boolean;
    right_axis?: { series: string; format?: RightAxisFormat };
  },
  seriesNames: readonly string[],
  rows?: number,
): boolean {
  // A stacked chart IS one bar per group: its series are entities in one unit.
  if (config.stacked) return false;
  if (config.panels === false) return false;
  if (seriesNames.length < 2) return false;
  if (rightAxisPlan(seriesNames.map((name) => ({ name })), config.right_axis)) return false;
  if (rows !== undefined && !panelsFitInRows(rows, seriesNames.length)) return false;
  return config.panels === true;
}

/** A bar's ISO currency, bar → group (COMPARE); "" when neither names one. */
export function barCurrencyOf(group: BarGroup, bar: BarGroup["bars"][number]): string {
  return (bar.currency?.trim() || group.currency?.trim() || "").toUpperCase();
}

/** One panel of a mixed-currency bar chart: its currency and its groups. */
export interface CurrencyPanel {
  currency: string;
  groups: BarGroup[];
}

/**
 * A bar chart whose bars read in two or more currencies, one panel per currency
 * (PO 2026-10-16), or null when they share one. Money is never converted, so
 * VND and USD bars on one axis would flatten the USD ones to nothing.
 *
 * A panel keeps only the categories that hold a bar in its currency (the AI CDP
 * keys groups by label AND currency, so a shared label arrives once per
 * currency). Shared categories (dates) keep the first-seen order in every
 * panel, so they line up down the stack; disjoint ones (each account's own
 * campaigns) appear only in their own panel instead of as empty columns.
 * Each category holds only that currency's bars, and its group fields come
 * from that currency's group.
 */
export function currencyPanels(groups: readonly BarGroup[]): CurrencyPanel[] | null {
  const currencies = [...new Set(groups.flatMap((g) => g.bars.map((b) => barCurrencyOf(g, b))))];
  if (currencies.filter(Boolean).length < 2) return null;
  const labels = [...new Set(groups.map((g) => g.label))];
  return currencies.map((currency) => ({
    currency,
    groups: labels.flatMap((label) => {
      const same = groups.filter((g) => g.label === label);
      const own = same.find((g) => g.bars.some((b) => barCurrencyOf(g, b) === currency));
      if (!own) return [];
      const bars = same.flatMap((g) => g.bars.filter((b) => barCurrencyOf(g, b) === currency));
      return [{ ...own, ...(currency ? { currency } : {}), bars }];
    }),
  }));
}

/** How a bar plot in ONE currency prints its money series. */
export interface BarCurrencyFormat {
  /** The series whose bars are money (by their `metric`). */
  series: string[];
  /** The left axis' ticks, only when every series is money. */
  formatTick?: (value: number) => string;
  formatValue: (value: number) => string;
}

/** Money bars (by their `metric`'s format) in `currency`; null without a currency or a money bar. */
export function barCurrencyFormat(groups: readonly BarGroup[], currency?: string): BarCurrencyFormat | null {
  if (!currency) return null;
  const money = new Set<string>();
  const other = new Set<string>();
  for (const g of groups) {
    for (const b of g.bars) (b.metric && columnFormatFor(b.metric) === "money" ? money : other).add(b.series);
  }
  if (money.size === 0) return null;
  return {
    series: [...money],
    ...([...other].every((name) => money.has(name))
      ? { formatTick: (v: number) => formatCompact(v, currencySymbol(currency)) }
      : {}),
    formatValue: (v: number) => formatByColumn(v, "money", currency),
  };
}

/** Stacked bar: the series in stacking order, `rest` moved last (top). A rest
 *  name that is not among the series changes nothing. */
export function stackedSeriesOrder(names: readonly string[], rest?: string): string[] {
  if (!rest || !names.includes(rest)) return [...names];
  return [...names.filter((n) => n !== rest), rest];
}

/** Sum of a group's drawn values; null values draw nothing and add nothing. */
export function stackTotal(values: readonly (number | null | undefined)[]): number {
  return values.reduce<number>((sum, v) => (typeof v === "number" ? sum + v : sum), 0);
}

/** Nguồn dữ liệu của một widget, để in ở chân widget cạnh mốc đồng bộ.
 *
 * CHỈ nền tảng, không kèm tên chỉ số: dòng phụ cũ ("TikTok Ads · reach") lặp
 * lại đúng cái tiêu đề in đậm ngay trên nó. Nền tảng thì không lặp — và một
 * bảng có thể trộn nhiều nguồn (xem lib/dashboard/templates.ts: meta_ads cạnh
 * tiktok_ads trong cùng một board), nên chip ở header panel không trả lời được
 * "ô NÀY lấy số từ đâu".
 */
export function platformLabel(binding: WidgetBinding | undefined): string | undefined {
  const source = bindingSource(binding);
  if (!source) return undefined;
  // The same table and fallback the panel header uses (`dashboardPlatformLabel`),
  // so `google_analytics` cannot read one way on the header and another here.
  return dashboardPlatformLabel(source);
}


/**
 * Whether these two readings are ones a goal can be judged from at all.
 *
 * Counts, durations, rates and costs. None of them can be negative, none of
 * them can be infinite, and none of them can be NaN — so a payload carrying any
 * of those is broken, and a broken payload must never render as a win.
 *
 * ONE predicate, used by `goalMet`, so a broken payload never renders as a win.
 */
function isMeasurable(actual: number, goal: number): boolean {
  return (
    Number.isFinite(actual) && Number.isFinite(goal) && actual >= 0 && goal >= 0
  );
}

/**
 * Whether a goal was met, judged by its DIRECTION.
 *
 * The sign of `actual - goal` is not the answer. A response time of 12 minutes
 * against a 15-minute commitment is a HIT; a CPL of $3.42 against a $3.00
 * ceiling is a MISS; and both are "actual below goal". `good_direction` is the
 * only thing that separates them, and a gauge that ignores it was reading
 * 12/15 as "80% of the way to the target" — a sentence that means nothing about
 * a commitment you are already inside.
 *
 * Anything `isMeasurable` rejects is NOT MET. `NaN <= 15` is already false, but
 * `-Infinity <= 15` and `-1 <= 15` are both TRUE, and neither "minus infinity
 * minutes" nor "minus one minute" is a service commitment being honoured — they
 * are broken payloads, and a broken payload must never render as a win. The
 * same predicate zeroes the ring, so the word and the drawing cannot disagree.
 *
 * Exported and pure so the builder, the widget and the tests share ONE rule.
 */
export function goalMet(actual: number, goal: number, goodDirection: "up" | "down"): boolean {
  if (!isMeasurable(actual, goal)) return false;
  return goodDirection === "down" ? actual <= goal : actual >= goal;
}

/**
 * How a grouped bar chart spaces its bars.
 *
 * Chart.js expresses this as two independent fractions of the category slot,
 * and they are not interchangeable — which is why they get two names here
 * rather than one shared gap:
 *
 *   categoryPercentage — how much of a category's slot the whole GROUP fills.
 *       What is left over is the gap BETWEEN groups.
 *   barPercentage      — how much of its own sub-slot each BAR fills. What is
 *       left over is the gap between the bars INSIDE a group.
 *
 * The default is Chart.js's own, capped at a 16px bar: correct for a
 * single-series chart, wrong for a paired one, where 16px slivers separated by
 * 32px do not read as pairs at all.
 */
export interface GroupedBarGeometry {
  categoryPercentage: number;
  barPercentage: number;
  maxBarThickness: number;
}

export function groupedBarGeometry(density?: "default" | "compact_grouped"): GroupedBarGeometry {
  return density === "compact_grouped"
    // Bars inside a group TOUCH (barPercentage 1), and a group takes 62% of its
    // slot so the 38% left over is unmistakably the gap between groups.
    ? { categoryPercentage: 0.62, barPercentage: 1, maxBarThickness: 30 }
    : { categoryPercentage: 0.8, barPercentage: 0.9, maxBarThickness: 16 };
}
