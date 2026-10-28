// Hợp đồng widget + từ vựng có kiểm soát (PRD §5.2 / §5.3).

export const WIDGET_TYPES = [
  "kpi_card",
  "goal_gauge",
  "line_chart",
  "pie_chart",
  "bar_chart",
  "funnel",
  "table",
  "ranking",
  "scatter_bubble",
  "media_card",
  "section_header",
  "live_status_bar",
  "note",
  // The one shape the library could not draw: a value over two categorical
  // axes. Added last, so it sorts last here too.
  "heatmap",
  "distribution",
  "status_list",
  "audience_summary",
  "funnel_modes",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

// Presentation choices for a data-chart module (PRD v1.2 §1.4). `widget`
// remains the source configuration's archetype; `config.view` selects an
// adapted renderer without changing the query, data, binding, or layout.
export const CHART_VIEWS = [
  "bar_chart",
  "pie_chart",
  "line_chart",
  "table",
  "funnel",
] as const;
export type ChartView = (typeof CHART_VIEWS)[number];

export const WIDGET_STATES = [
  "loading",
  "ok",
  "ok_stale",
  "empty",
  "error",
  "timeout",
  "quota_exceeded",
  "unauthorized",
] as const;
export type WidgetState = (typeof WIDGET_STATES)[number];

// App / metric / range form the controlled binding vocabulary, but the ALLOWED
// values are not hardcoded here — they are fetched at runtime from the CDP
// single source (see lib/dashboard/vocabulary.ts, served by
// GET /api/v1/dashboard/vocabulary). These aliases stay `string`; membership is
// validated at runtime by mappingSchema against the served set. Widget/chart
// types below remain a front-end rendering capability, not part of that data
// contract.
export type App = string;
export type Metric = string;
export type Range = string;

/**
 * A binding in the shape every board stored so far carries: one ad platform
 * (`app`), one `metric`, a `range` preset.
 */
export interface LegacyWidgetBinding {
  app: string;
  metric: string;
  range: string;
  // Present only when range === "custom" — a free-form window is not a member
  // of the served vocabulary, so it carries its own literal ISO dates instead
  // (mappingSchema.ts validates these in place of a whitelist check; see
  // CLUEGA_AI_CDP/app/llm/dashboard/vocab.py's CUSTOM_RANGE for the producer
  // side of the same contract).
  range_start?: string;
  range_end?: string;
  /** WHAT this widget's delta is measured against — a property of the WIDGET,
   *  not of the board. `wow`/`mom` are the original pair and stay: boards have
   *  persisted them. The producer stamps `previous_period` on every binding of
   *  a board that holds the prior window (CLUEGA_AI_CDP
   *  `widget_slot_builder._compare_mode`), which is what lets one board carry a
   *  KPI against last period beside a gauge against a target. Absent ⇒ the
   *  widget states a level and no change. */
  compare?: "none" | "previous_period" | "same_period_last_year" | "custom" | "wow" | "mom";
  dimensions?: string[];
  /**
   * Every series a MULTI-metric widget draws, primary first — `metric` stays
   * the first of them and remains the widget's identity. OPT-IN: absent on a
   * single-metric widget and on every board stored before the field, where the
   * primary alone is the whole truth.
   *
   * A binding is the whole of what a widget knows about itself once the prompt
   * that built it is gone, and a REFETCH is exactly that situation: the range
   * chips re-ask for each widget one at a time through `/widget-data`, where
   * the producer has no sentence to re-read (`_steer_primary_metric`: "a
   * natural-language read this path has no message for"). So the metric list
   * came back empty and a multi-series chart was rebuilt from its primary
   * alone. Measured 2026-09-09 by switching a live board from 7 to 14 days:
   * "Spend × Results trend" returned as "Spend trend", and a three-series
   * campaign bar chart returned drawing only Results — and the line chart lost
   * its indexed axis with the second series, so what the reader saw was a flat
   * line where a readable one had been.
   *
   * The producer re-stamps it from what it actually DREW, so a series these
   * rows cannot serve is dropped rather than faked.
   */
  metrics?: string[];
  /** The ONE campaign objective (and ad-group delivery) the board was built
   *  for — "Lead Gen campaigns only". Stamped by the producer on a narrowed
   *  board and sent back on every refetch: without it a Refresh or a range chip
   *  re-read the whole account, and a Lead Gen card showing $2,226.85 came back
   *  as $28,286.92 (R2, 2026-09-26). Absent ⇒ the whole account. */
  objective?: string;
  delivery?: string;
  /** Hours per point of an hourly binding (producer stamps it when > 1). Sent
   *  back on refetch so a 2-hourly line does not come back one point per hour
   *  (fix-plan #18). */
  time_step?: number;
  /** Rows a ranking / time-slot table was asked for, sent back on refetch so a
   *  "top 10" or "last 6 slots" keeps its length. */
  rows?: number;
  /** Which end a ranking leads with ("lowest first" → `low`), sent back on
   *  refetch: without it a Refresh re-sorted a cost by its good direction. */
  rank_direction?: "top" | "bottom" | "high" | "low";
  /** THE DRILL SCOPE (BUG-104-RD-W-13): the campaign — and within it the ad
   *  group — a Detail Table view was drilled into, by the platform's own ids.
   *  Only ever on the binding of a drilled VIEW (`lib/dashboard/tableDrill.ts`),
   *  which the panel fetches and never writes back: no stored board carries
   *  it. The producer narrows the whole fetch to it and echoes it back. */
  campaign_id?: string;
  adgroup_id?: string;
  /** A drilled view's PAGE and the column it is sorted by. The producer sorts
   *  and pages the WHOLE scope (`widget_data._page_table`), so a sort is never
   *  a reordering of one page. Only on a drilled view's binding. */
  page?: number;
  sort_key?: string;
  sort_dir?: "asc" | "desc";
  /**
   * The template whose layout this widget belongs to, when the FRONT END owns
   * that layout — today only `sales-app-daily` (012). Stored with the widget so
   * every refill states it; the producer reads it to allow the one shape no
   * other board may ask for, a table whose rows are days. Absent everywhere
   * else, which keeps every other request byte-for-byte what it was.
   */
  template_id?: string;
  /**
   * A heatmap's FRAME — its rows, columns, value, colour, marks and cells — as
   * the producer stamped it (CLUEGA_AI_CDP `widget_data.WidgetDataBinding.heat`).
   * Opaque here: the producer owns its shape and validates it. Sent back on
   * every refill: without it a range chip redrew "hour of day × weekday" as
   * "This data has one axis, not the two a heatmap needs", and the frequency grid lost its cap mark (D1-37, 2026-10-12).
   * Absent on every other widget.
   */
  heat?: Record<string, unknown>;
  /** The accounts of THIS cell's own platform on a multi-platform board (2+ = a compare read). Absent on a cell of the board's own platform. */
  account_ids?: string[];
  /**
   * A combined cell's accounts across sources, each `(source, account_ids)` (CLUEGA_AI_CDP
   * `widget_data.WidgetDataBinding.members`): one widget over every source of the board, each
   * account read on its own source. Wins over `account_ids` and the board's scope; absent on a
   * cell that reads one source.
   */
  members?: { source: string; account_ids: string[] }[];
  /**
   * The language the board titles its widgets in, as the producer stamped it on the cell (CLUEGA_AI_CDP
   * `widget_data.WidgetDataBinding.locale`). Sent back on every refill, which draws the cell in it over the
   * request's UI `locale`: without it a board built from a Vietnamese request on an English UI came back
   * titled in English after its first refill, and in Vietnamese again after the next edit (e2e step 19,
   * 2026-10-16). Absent on a cell saved before it.
   */
  locale?: string;
  /**
   * What a one-account cell of a board over several accounts is titled with ("TESTCalvin", plus the source on a
   * board reading several), as the producer stamped it (CLUEGA_AI_CDP `widget_data.WidgetDataBinding.account_label`).
   * Sent back on every refill, which titles the cell with it: without it two split heatmaps came back titled alike
   * after the refill that follows publish (2026-10-16). Absent on every other cell.
   */
  account_label?: string;
  /**
   * The reader asked for an account TOTAL (CLUEGA_AI_CDP `WidgetDataBinding.accounts_total`). Sent back on every
   * refill so the refreshed cell stays the total rather than splitting per account. Absent on every other cell.
   */
  accounts_total?: boolean;
  /**
   * A scatter's three axes — X (also `metric`), Y and the bubble size — as the producer stamped them (CLUEGA_AI_CDP
   * `WidgetDataBinding.x_metric` / `y_metric` / `r_metric`). Sent back on every refill, which draws those axes:
   * without them a refresh read X alone and came back an empty cell titled with X (e2e 17/10 steps 18/20). Absent
   * on every other widget; a scatter saved before them sends its config's axes instead (`widgetData.ts`).
   */
  x_metric?: string;
  y_metric?: string;
  r_metric?: string;
}

/** What a `kind: "query"` binding asks its source for. The backend owns the full shape. */
export interface SourceQuery {
  metrics?: string[];
  dimensions?: string[];
  /** A range preset name, or the relative window a source's own preset states (`{unit, count, ...}`). */
  range?: string | Record<string, unknown>;
  level?: string;
  /** A compare mode, or a switch for the previous period (a preset's `compare`). */
  compare?: string | boolean;
  sort?: { metric: string; order?: "asc" | "desc"; dir?: "asc" | "desc" };
  limit?: number;
  [key: string]: unknown;
}

/** A raw read of one tool of a connected toolkit (`kind: "read"`). */
export interface SourceRead {
  tool: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Every field of the legacy shape, as absent: lets a shared read such as `binding.metric` compile on either arm. */
type LegacyFieldsAbsent = { [K in keyof LegacyWidgetBinding]?: undefined };

/**
 * The binding of a widget on a data source other than a native ad app — a
 * `composio:<toolkit>` source, or a native one in the one-shape form
 * (`dashboard-data-sources.md` §7). Sent to the backend as it is.
 *
 * `kind: "query"` asks the source for metrics by key; `kind: "read"` is a raw
 * recipe (`read`) whose table `agg` reduces to the figures drawn. Both carry
 * `source`, and neither has `app` / `metric` / `range` at its top level.
 */
export interface SourceWidgetBinding extends LegacyFieldsAbsent {
  source: string;
  kind: "query" | "read";
  query?: SourceQuery;
  read?: SourceRead;
  agg?: { op: string; [key: string]: unknown } | null;
}

/** A widget's binding: the legacy `{app, metric, range}` or the source shape. */
export type WidgetBinding = LegacyWidgetBinding | SourceWidgetBinding;

export function isSourceBinding(binding: WidgetBinding | null | undefined): binding is SourceWidgetBinding {
  return !!binding && typeof (binding as SourceWidgetBinding).source === "string" && (binding as SourceWidgetBinding).kind !== undefined;
}

/** A source slug carrying a namespace (`composio:<toolkit>`): not a native ad app, so it reads through the one-shape binding. */
export function isNamespacedSource(source: string): boolean {
  return source.includes(":");
}

/** The platform a binding reads from: `app` for the legacy shape, `source` for the new one. */
export function bindingSource(binding: WidgetBinding | null | undefined): string | undefined {
  if (!binding) return undefined;
  if (isSourceBinding(binding)) return binding.source;
  return binding.app || undefined;
}

/** The metric keys a binding reads, primary first: `metrics` / `metric` of the legacy shape, `query.metrics` of a source one. */
export function bindingMetrics(binding: WidgetBinding | { metric?: string; metrics?: string[] } | null | undefined): string[] {
  if (!binding) return [];
  if (isSourceBinding(binding as WidgetBinding)) {
    return ((binding as SourceWidgetBinding).query?.metrics ?? []).filter((m) => typeof m === "string");
  }
  const legacy = binding as { metric?: string; metrics?: string[] };
  return legacy.metrics?.length ? legacy.metrics : legacy.metric ? [legacy.metric] : [];
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetSlot<C = unknown> {
  slot_id: string;
  widget: WidgetType;
  layout: WidgetLayout;
  // Optional because it genuinely is: section_header, live_status_bar and note
  // are structural — they carry no data reference, and the producer omits the
  // key entirely. Declaring it required made every read look safe, and reading
  // `slot.binding.metric` on a note threw at runtime.
  binding?: WidgetBinding;
  config?: C;
  state: WidgetState;
  synced_at?: string;
  /** When the board's sources last finished syncing this cell's data (the engine's, RFC 3339); absent unstated. */
  source_synced_at?: string;
  data?: unknown;
  // Widget types that can render this slot's metric from its fetched payload —
  // server-computed; drives the on-widget type switcher. Runtime-only (never
  // persisted; toPersistedSlots drops it).
  renderable_widgets?: WidgetType[];
}

/**
 * COMPARE slot data (multi-account boards, `accounts_mode: "compare"`), producer side.
 *
 * Every per-account item — a KPI band, a line series, a bar group or bar, a
 * ranking row, a table row — carries `account_id` (an id from the board's
 * `accounts`) and `account_label` (the account's name as the source read it).
 * An item over ALL the accounts carries `total: true` and no `account_id`; it
 * is sent only when a total was asked for and the accounts share a currency.
 * The renderer picks each account's colour from its index in the board's
 * `accounts` order (see accountCompare.ts); the producer never sends colours.
 * Every other board's slots carry none of these keys and draw as before.
 */
export interface AccountTagged {
  account_id?: string;
  account_label?: string;
  total?: boolean;
}

/** A producer's note as the wire carries it: `{vi, en, zh}`, shown in the UI language
 *  (`noteText`), or a plain string (a board saved before the object), shown as written. */
export type LocalizedNote = string | Partial<Record<"vi" | "en" | "zh", string>>;

/** One account's reading on a COMPARE KPI card (or the all-accounts band, `total: true`). */
export interface KpiBand extends AccountTagged {
  /** `null` = not measured / not summable; `unavailable_reason` says why. Never 0. */
  value?: number | null;
  delta?: number;
  delta_unit?: "percent" | "percentage_point";
  /** The band's own ISO currency: accounts are shown in theirs, never converted. */
  currency?: string;
  unavailable_reason?: LocalizedNote;
  /** Why a measured band has no delta (a short localized sentence from the server). */
  delta_reason?: string;
}

// ── Config theo loại widget ────────────────────────────────────────────────

export interface KpiCardConfig {
  label: string;
  /** Columns this card takes in a row that DECLARES its widths (all cards of
   *  the row claim one, adding to 12). OPT-IN — absent, the band packs as it
   *  always did; see `declaredSpans` in layoutEngine. */
  layout_span?: number;
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  subtitle?: string;
  /** Vắng khi producer TỪ CHỐI nêu số (xem `unavailable_reason`). Không phải 0:
   *  "không đo được" khác "đo được bằng 0". */
  value?: number;
  unit?: string;
  /**
   * Cách in con số, do PRODUCER khai báo (`_column_format` trong
   * widget_slot_builder.py) — cùng key mà cột bảng và
   * dòng ranking đã mang sẵn, và FE in chúng bằng `formatByColumn`.
   *
   * Thẻ KPI từng là widget DUY NHẤT tự suy ra định dạng từ tên metric, bằng
   * một bảng phân loại thứ hai (`columnFormatFor`) đã lệch khỏi bảng của
   * producer: đo 2026-09-17, bảng đó chỉ coi {ctr, cvr} là phần trăm, nên
   * completion_rate 6.32 in "6.32%" ở bảng và "6" ở thẻ ngay bên cạnh — cùng
   * một con số, hai kết quả. Lệch theo cả HỌ hình dạng tên chứ không phải vài
   * cái tên xui: cả 7 metric `*_rate` trong `vocab.METRICS` và `purchase_roas`.
   *
   * OPT-IN: board lưu trước thay đổi này không có key, `formatMetric` rơi về
   * `columnFormatFor` đúng như cũ.
   */
  format?: ColumnFormat;
  metric?: Metric;
  delta?: number; // % thay đổi so với kỳ trước
  /**
   * Đơn vị của `delta`. OPT-IN — vắng thì in "%", đúng như mọi thẻ hiện có.
   *
   * Một tỷ lệ đi từ 39.1% lên 41.2% KHÔNG tăng "2.1%" — nó tăng 2.1 ĐIỂM phần
   * trăm; nói "2.1%" là một con số khác hẳn (tăng 2.1% của 39.1 là 0.8 điểm).
   * Đơn vị phải do producer khai báo, KHÔNG suy ra từ tên metric hay nhãn: chi
   * phí, lượt gửi và CPL cũng là những con số có thể mang delta phần trăm thật.
   */
  delta_unit?: "percent" | "percentage_point";
  delta_text?: string;
  compare_text?: string;
  /** What the delta is measured against, localized ("vs previous day"), for a
   *  card that compares one day to the day before. Wins over `compare_text`. */
  compare_label?: string;
  /** The metric per day across the board window, drawn as a small trend line
   *  beside the value. OPT-IN; fewer than two measured points draws nothing. */
  sparkline?: Array<{ date: string; value: number | null }>;
  /** The source's own note on the figures (see `LocalizedNote`). */
  source_note?: LocalizedNote;
  /** Producer's localized note that this is a per-day figure, not a period
   *  total. The shell prints it under the card (shellPropsFor). */
  by_day_note?: LocalizedNote;
  good_direction?: "up" | "down";
  alert?: boolean;
  /**
   * Rank within a KPI band. OPT-IN — absent keeps every existing behaviour.
   *
   * Two things read it. The layout engine tiles same-rank tiles as a GROUP, so
   * a band of six never lays out as a row and a half. The card itself renders a
   * secondary tile more quietly, because width alone cannot carry hierarchy: a
   * secondary tile is often WIDER than a primary one, and at 860px both sit at
   * the same span.
   */
  emphasis?: "primary" | "secondary";
  /** OPT-IN. Chuyển thẻ sang bảng màu báo cáo. Chỉ là màu và mặt nền — thẻ
   *  vẫn in đúng con số, đúng metric và đúng delta như khi vắng cờ. */
  presentation?: WidgetPresentation;
  /**
   * Vạch ngữ nghĩa trên mép thẻ. OPT-IN, và chỉ có nghĩa khi `presentation`
   * cũng có mặt.
   *
   * Trước đây mọi thẻ báo cáo đều đội một vạch xanh giống hệt nhau — một đường
   * kẻ không phân biệt gì cả. Vạch chỉ nên xuất hiện khi thẻ có chuyện để báo,
   * và khi đó nó mang màu của chuyện đó. Chữ và delta vẫn nói y như cũ, nên
   * vạch không bao giờ là tín hiệu duy nhất.
   */
  status_accent?: "warning" | "critical";
  /**
   * Nguồn của con số, đã dịch. OPT-IN.
   *
   * Điền vào chỗ nền tảng của thẻ — chỗ vốn suy ra từ `binding`. Một chỉ số
   * DERIVED không có binding, nên trước đây xuất xứ của nó để trống; bịa một
   * binding chỉ để hiện chip là tuyên bố board fetch được thứ nó không fetch
   * được. Khác `subtitle`, thứ mô tả CÔNG THỨC.
   */
  source_label?: string;
  /** Một dòng nói vì sao thẻ này không có số — nguồn không trả về, hoặc trả về
   *  một giá trị không thể đúng. Thay cho `note` full-width trước đây: state
   *  thuộc về ô (UI Spec §4.2), và `empty` là SAI ở đây vì nó mời đổi khoảng
   *  ngày, mà đổi ngày không sửa được một chỉ số cộng dồn sai bản chất. */
  unavailable_reason?: LocalizedNote;
  /**
   * The SAME measure over several observation windows, in one card. OPT-IN.
   *
   * Absent — production and every card authored before this — the tile draws
   * one `value` and one `delta`, byte for byte as it always has.
   *
   * Retention is the case that forced it. D1, D7 and D30 are not three metrics
   * and they are not three periods of one metric either: they are one metric
   * measured at three ages of the same cohort, and they only mean anything read
   * together. As three separate tiles they take half the KPI band and invite
   * comparing D1 against D7 as though one had gone down.
   *
   * Each window carries its own delta because each is measured against its own
   * previous cohort, and its own `alert` because the client's threshold applies
   * per window (D1 < 30% here, with D7 and D30 unthresholded). `value` may be
   * omitted when a card is windows-only; the card is not empty in that case.
   */
  windows?: Array<{
    /** "D1", "D7" — an observation window, already translated where it is copy
     *  and left literal where it is a label the industry writes in ASCII. */
    label: string;
    value: number;
    unit?: string;
    delta?: number;
    delta_unit?: "percent" | "percentage_point";
    /** This window alone breached the client's threshold. */
    alert?: boolean;
  }>;
  /** COMPARE only: one band per account, plus `total: true` when a total was asked. */
  bands?: KpiBand[];
}

export interface SeriesPoint {
  x: string | number;
  /** `null` = ngày nằm trong cửa sổ nhưng CHƯA có dữ liệu (nền tảng chưa sync).
   * Khác hẳn `0` — `0` là "đã sync, không tiêu đồng nào". Renderer phải NGẮT
   * đường tại điểm null, không được vẽ nó thành 0 (xem hợp đồng `measured` của
   * Report Hub §3.4 và `_daily_series_points` phía AI CDP). */
  y: number | null;
}
export interface LineSeries extends AccountTagged {
  name: string;
  points: SeriesPoint[];
  /** The producer's metric key for this series, when it is one metric's line. */
  metric?: string;
  /** COMPARE, a cell of several series per account: the series' own name (its metric's
   *  label, an entity), said beside the account's name. Absent → the account alone. */
  series_label?: string;
  /** Set by the RENDERER (a COMPARE account's colour), never by the producer.
   *  Absent → the palette slot `lineSeriesPlan` assigns, as always. */
  color?: string;
  /** Set by the RENDERER when `name` was cut for the legend: the account's full name. */
  full_name?: string;
  /** ISO currency of a COMPARE board's money series (the account's). Absent →
   *  the account's `currency` from the board accounts. */
  currency?: string;
}
/**
 * The ONE opt-in flag for the executive-report treatment.
 *
 * Absent — production and 28 of 29 templates — every widget renders exactly
 * the markup it always produced. Present, a widget may spend more ink on
 * reference (axis values, row separators, status pills) because the board is
 * being read as a report rather than glanced at in a panel.
 *
 * A single shared name rather than one boolean per widget, so a board cannot
 * end up half-upgraded: the spec says "command centre" once and every widget
 * on it agrees.
 */
export type WidgetPresentation = "command_center";

export interface LineChartConfig {
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  label?: string;
  subtitle?: string;
  series: LineSeries[]; // ≤3
  x_axis?: string[];
  y_unit?: string;
  /**
   * OPT-IN. Adds what a report needs and a panel does not: values on the y
   * gridlines, a second signal (dash pattern) separating the series so colour
   * is not the only one, rings on the best and worst day of the first series,
   * and a legend that says its number is the LAST point rather than a total.
   *
   * It also reclaims the 96px right gutter, which existed only to hold the
   * end-of-line value labels that moved into the legend.
   */
  presentation?: WidgetPresentation;
  /** Row pairing — see WidgetLayoutRole. Absent → packs as it always did. */
  layout_role?: WidgetLayoutRole;
  /** Producer's reason this cell holds nothing — printed INSTEAD of the shell's
   *  "no data in the selected period". Same contract as `KpiCardConfig` and
   *  `FunnelConfig`: the generic line blames the date window, and a shape this
   *  archetype cannot draw ("a two-period comparison carries no daily rows")
   *  is not fixed by changing the window. */
  unavailable_reason?: LocalizedNote;
  /**
   * The x label at which every series stops being MEASURED and starts being
   * PROJECTED. OPT-IN — absent, every point is a measurement, which is what
   * every chart before this draws.
   *
   * From this label onward the line is dashed and its points are hollow. Two
   * signals rather than a caption, because the difference is not a nuance: a
   * payback curve that reads 90% at D90 is a forecast, and a reader who takes
   * it for a measurement will report it as one. It is a LABEL and not an index
   * so it survives a window that starts somewhere else.
   */
  forecast_from_x?: string | number;
  /**
   * A horizontal line the series is read AGAINST — a break-even, a target, a
   * ceiling. OPT-IN; absent draws nothing.
   *
   * Not a series: it has no points, it must not appear in the legend, and it
   * must not enter the magnitude comparison that decides whether two series
   * diverge. `label` is always drawn beside it, so its colour is a second
   * reading.
   */
  reference_line?: {
    value: number;
    label: string;
    tone?: "neutral" | "warning" | "critical";
  };
  /**
   * Draw each series in its OWN stacked plot, sharing one x axis, instead of
   * one plot with one scale.
   *
   * The escape from the case the footnote could only apologise for. Two COUNTS
   * of different magnitude must not share a scale (the small one flattens onto
   * the baseline) and must not take a second axis either (`right_axis` below
   * says why: two counts on separate scales look identical however far apart
   * they are). Panels are the third answer — each series keeps a scale it can
   * be read on, and the shared x keeps the days aligned, so "did submissions
   * follow opens on the 4th" is still answerable by looking straight down.
   *
   * Measured 2026-09-08 on advertiser 7588575096948948999: form opens ran
   * ~2,100/day against submissions ~70/day, 30× apart. On one scale the
   * submissions line sat on the floor for all seven days and carried nothing.
   *
   * THREE-STATE, and the default is the important one:
   *   `undefined` — automatic. Panels appear only when the magnitudes actually
   *                 diverge, so every chart that reads fine today is untouched.
   *   `true`      — always panels (≥2 series).
   *   `false`     — never; keeps the single plot and the footnote.
   * `right_axis` wins over all three: a chart that names a valid ratio series
   * is the narrow case that deliberately wants both lines in one frame.
   */
  panels?: boolean;
  /** Ignored since 2026-10-14; old saved boards may still carry it. */
  normalize?: "index_100";
  /**
   * ONE series moved to a second y axis on the right. OPT-IN; absent, this
   * chart has a single axis exactly as it always has.
   *
   * The single axis is the default for a reason worth restating rather than
   * deleting: two COUNTS of the same kind on separate scales look identical
   * however far apart they are, and the relationship between them — the whole
   * point of plotting them together — disappears. That argument is about two
   * measures of the same kind.
   *
   * It does not hold for a RATIO against AMOUNTS. Revenue, net revenue and
   * spend run in the thousands while ROAS runs between 2 and 4: on one axis
   * the ROAS line is pinned flat on the floor and carries no information at
   * all, which is the case `seriesMagnitudesDiverge` currently only apologises
   * for in a footnote. So this is deliberately NARROW — one named series, and
   * the chart falls back to a single axis if that series is not present.
   *
   * The axis is labelled and its ticks carry their own unit, and the series is
   * marked in the legend as belonging to it, so which scale a line is read
   * against is never conveyed by colour alone.
   */
  /**
   * Whether the y axis starts at zero. OPT-IN, and only ever `false` — absent
   * keeps the zero baseline every chart authored before this drew.
   *
   * Zero is a real, reachable state for a COUNT: an ad group with no results
   * had none, and a line drawn from zero says how far from that it sits. For a
   * RATIO it is not — a cost per result of $0 means the platform charged
   * nothing, which never happens — so the baseline is a reference the reader
   * has no use for, and the series is squashed against the top of the box.
   *
   * Measured 2026-09-09 on a live board: `cost_per_result` moved 12.84 → 13.72
   * across the week, 7%, and drawn 0…20 it was a ruler-flat line — a chart
   * titled "trend" reporting that nothing happened. The identical reasoning is
   * already written on the RIGHT axis in `chartjs/kit.ts`; it had never reached
   * the left one.
   *
   * Producer-decided (`widget_slot_builder._ratio_only`) because it turns on
   * what the metrics MEAN, not on their numbers: a count that happens to sit
   * between 60 and 75 still wants its zero.
   */
  y_from_zero?: boolean;
  right_axis?: {
    /** The `name` of the series that moves. An unmatched name is ignored and
     *  the chart stays single-axis — never a silently mis-scaled line. */
    series: string;
    /** The axis caption, already translated. */
    label?: string;
    /**
     * How its ticks and readings print — `ratio` → "3.15x", `money` → "$13.28"
     * (ticks compact: "$1.2k"), `percent` → "3.25%".
     *
     * The axis exists BECAUSE its series is measured in something the left axis
     * is not, so printing it in the left axis's terms defeats the opt-in. This
     * was `"ratio"` or nothing, and nothing meant the plain compact number —
     * fine while `roas` was the only series anyone put here. Once the producer
     * started emitting `right_axis` for any ratio whose parents are off-chart, a
     * `cost_per_*` reached the axis and printed `13.3` for `$13.28`: a price
     * with its currency removed, on the one axis whose whole point is its unit.
     *
     * `money` and `percent` match `formatByColumn`, so a figure reads the same
     * here as in a table cell; `ratio` keeps the `x` this axis has always
     * printed. Absent keeps the old compact number.
     */
    format?: "ratio" | "money" | "percent";
  };
}

export interface PieSlice extends AccountTagged {
  label: string;
  value: number;
  /** ISO currency of the account this item reads (COMPARE boards only):
   *  accounts are never converted, so each item keeps its own. */
  currency?: string;
}
export interface PieChartConfig {
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  label?: string;
  subtitle?: string;
  slices: PieSlice[];
  total_label?: string;
  total_prefix?: string; // ví dụ "$"
  /** OPT-IN. Bảng màu báo cáo. Thứ hạng lát vẫn tính từ GIÁ TRỊ như cũ — chỉ
   *  thang màu đổi, không lát nào đổi kích thước hay đổi vị trí. */
  presentation?: WidgetPresentation;
  /**
   * Cách xếp chú giải. OPT-IN — vắng giữ `"spread"`, đúng như mọi donut hiện có.
   *
   * `"spread"` cho nhãn `flex-1` nên phần trăm bị đẩy sát mép phải thẻ: với một
   * nhãn ngắn, con số nằm cách chính nhãn của nó vài chục pixel và đọc ra như
   * thuộc về cái card chứ không thuộc về lát nào. `"compact"` gom nhãn và phần
   * trăm thành MỘT nhóm nội dung — nhãn co lại khi hết chỗ, phần trăm không bao
   * giờ rời khỏi nhãn của nó.
   */
  legend_layout?: "spread" | "compact";
  /** Row pairing — see WidgetLayoutRole. Absent → packs as it always did. */
  layout_role?: WidgetLayoutRole;
  /** See `LineChartConfig.unavailable_reason`. */
  unavailable_reason?: LocalizedNote;
}

export interface BarGroup {
  label: string;
  /** COMPARE: the group IS one account (its bars are that account's metrics). */
  account_id?: string;
  account_label?: string;
  /** Renderer-set fill for every bar of the group (an account's colour). */
  color?: string;
  /** ISO currency of this group's money (COMPARE); a bar's own wins, else the card's. */
  currency?: string;
  /** `value: null` = this row carries no value for the series (TA-03): no bar
   *  is drawn and the tooltip reads "—". Not `0`, which is a measured zero.
   *  COMPARE: a bar may name its account (`account_id`); `color` is renderer-set.
   *  `metric` is the producer's metric key, which decides whether the bar is money. */
  bars: {
    series: string; value: number | null; metric?: string; account_id?: string; account_label?: string;
    /** COMPARE: the bar's own series name beside its account's (see `LineSeries.series_label`). */
    series_label?: string; color?: string; currency?: string;
  }[];
  /**
   * A reading ABOUT the group, drawn above its bars. OPT-IN — absent draws
   * nothing, which is every chart before this.
   *
   * A spend-vs-revenue pair answers "how much" but not "was it worth it": the
   * ratio between the two bars IS the answer, and asking a reader to divide two
   * bar heights by eye is asking them not to. Already formatted, because the
   * producer owns the arithmetic — the chart never derives it from the bars, or
   * it would disagree with the table the moment a rounding differed.
   */
  annotation?: string;
}
export interface BarChartConfig {
  label?: string;
  subtitle?: string;
  groups: BarGroup[];
  y_unit?: string;
  /** OPT-IN report treatment: the report palette, exactly as LineChart takes
   *  it. No group moves and no bar changes value. */
  presentation?: WidgetPresentation;
  /**
   * How the bars are SPACED. OPT-IN — absent keeps Chart.js's own defaults and
   * the 16px cap, which is what every existing chart draws.
   *
   * `compact_grouped` is for a chart whose point is the PAIR: the two bars of a
   * group touch and the gap left over lands between groups instead. At the
   * default spacing a paired chart draws 16px slivers separated by 32px, so the
   * eye groups the wrong two bars. See `groupedBarGeometry`.
   */
  bar_density?: "default" | "compact_grouped";
  /**
   * ONE stacked bar per group instead of a cluster. OPT-IN — absent keeps
   * every existing chart. Each group (e.g. a day) holds one bar per entity
   * (`series` = entity name, one shared unit); the bars stack in series order.
   * Never split into panels, never a compare chart.
   */
  stacked?: boolean;
  /** With `stacked`: the series drawn in the light grey token, last (top). */
  rest_series?: string;
  /**
   * One plot per SERIES, stacked, instead of one cluster. OPT-IN — absent, and
   * on every chart authored before this, the clustered plot is unchanged.
   *
   * A clustered chart puts every series on one linear axis, and a bar states
   * its value as a LENGTH from that axis's zero. Measured 2026-09-09: result
   * (177), spend ($2,541) and cost_per_result ($14.36) in one cluster on a 0–4k
   * scale drew the result bar at 4% of the box and the price bar at 0.36% —
   * under a pixel. The legend named three series; the chart drew one.
   *
   * `false` pins the clustered plot even when the magnitudes diverge — the
   * author's call. See `barRendersAsPanels` for the precedence, including the
   * height floor that outranks `true`.
   */
  panels?: boolean;
  /**
   * Move ONE series to a second axis on the right. OPT-IN, same contract and
   * same formats as `LineChartConfig.right_axis`, because a figure must read
   * the same on either chart.
   *
   * Restricted by the producer to a ratio whose own parents are NOT plotted:
   * two AMOUNTS on two axes look identical however far apart they are, which
   * for bars is worse than for lines — two bars of equal length carry an
   * explicit claim of equality that two dots at the same height do not.
   */
  right_axis?: {
    series: string;
    label?: string;
    format?: "ratio" | "money" | "percent";
  };
  /** See `LineChartConfig.unavailable_reason`. */
  unavailable_reason?: LocalizedNote;
}

export interface FunnelStage {
  /** True when the stage comes from CRM / IM, not the ad platform. The widget
   *  marks it, so the boundary between ad data and back-office data is on the
   *  chart rather than in the reader's head. */
  supplemental?: boolean;
  label: string;
  value: number;
  /**
   * This stage's conversion rate as a PERCENT, computed by the producer as
   * Σnumerator / Σdenominator over the window — never an average of daily
   * rates. Read only when `FunnelConfig.rates_declared` is true.
   *
   * Absent there means the stage states NO rate, which is different from a rate
   * of zero: `units_sold` on a Shop board is items per order, not a conversion
   * of anything, and dividing it by the stage above printed it as "133.0%"
   * under a heading that says conversion.
   */
  rate?: number;
  /** The LABEL of the stage `rate` is measured against. A percentage whose
   *  denominator is unnamed is a number the reader has to guess the meaning of,
   *  and on a five-stage funnel the guess is usually "the stage above" — which
   *  is exactly the assumption this field exists to stop making. */
  rate_of?: string;
}
export interface FunnelConfig {
  label?: string;
  subtitle?: string;
  stages: FunnelStage[];
  /**
   * The producer has stated every rate this funnel can state, so the widget
   * prints those and derives none.
   *
   * OPT-IN, and absence is LEGACY rather than a decision: a board stored before
   * the producer declared denominators still divides by the stage above, which
   * is what it has been showing all along. Dropping those percentages on reopen
   * would be its own kind of wrong — the fix is that anything built or
   * refreshed from now on says what its denominators are.
   */
  rates_declared?: boolean;
  /** What the mark on a `supplemental` stage means, in words. Required in
   *  practice whenever a stage carries the flag: a dagger nobody explains is a
   *  smudge, and colour alone may never be the signal. */
  supplemental_note?: string;
  /** OPT-IN report treatment: the report palette. No stage moves, no rate
   *  changes — only which token draws the bars. */
  presentation?: WidgetPresentation;
  /** Một dòng nói vì sao ô này không có tầng nào để vẽ — nguồn không trả dữ
   *  liệu từng tầng cho phễu được yêu cầu. Cùng hợp đồng với
   *  `KpiCardConfig.unavailable_reason`: shell in nó THAY cho câu empty mặc
   *  định, vì "không có dữ liệu trong khoảng đã chọn" đổ lỗi cho cửa sổ thời
   *  gian, trong khi đổi ngày không làm nguồn sinh ra trường nó không có. */
  unavailable_reason?: LocalizedNote;
  /**
   * The stage labels ALREADY state their conversion rate, so the widget must
   * not print a second copy beside the value.
   *
   * OPT-IN, and the default is the production contract. `_funnel_slot` in the
   * AI service emits plain labels — `{"label": "Lượt click", "value": 9000}` —
   * so a dashboard built from a chat turn has no rate anywhere unless this
   * widget computes and renders one. Absent or false therefore means: compute
   * the step rate and show it.
   *
   * The template builder is the one case that sets it. It bakes the rate into
   * the label because only IT knows which stage the spec nominated as the
   * denominator: a `first_stage` funnel states two ratios ("so lượt xem" and
   * "so bước trước"), a `previous_stage` funnel one. The widget cannot know
   * that, so it defers rather than guess — and never sniffs the label for a "%"
   * to decide, which would break on a stage whose NAME contains a percentage.
   */
  rateEmbeddedInLabel?: boolean;
  /**
   * Events that all hang off ONE stage, side by side rather than in a chain.
   * OPT-IN — absent, the funnel is the sequential ladder it has always been.
   *
   * A mobile funnel stops being a chain after the install: `tutorial_complete`
   * and `first_purchase` are both measured against first-open, and neither is
   * upstream of the other. Appending them as stages five and six would claim a
   * sequence the MMP never reported and would make the second one's rate a
   * ratio of two unrelated events. Drawing them abreast is the claim the data
   * actually supports.
   *
   * `rate` is the producer's, computed against `custom_events_note`'s stage —
   * the widget never derives it, exactly as it never derives a stage rate when
   * `rateEmbeddedInLabel` is set.
   */
  custom_events?: Array<{
    label: string;
    value: number;
    /** Share of the denominator stage, already formatted ("83%"). */
    rate: string;
    /** What this event is, one line — "custom event 1". */
    note?: string;
  }>;
  /** Which stage every custom event is measured against, in words. Required in
   *  practice whenever `custom_events` is present: a rate with an unnamed
   *  denominator is unreadable. */
  custom_events_note?: string;
}

/**
 * `duration` holds MINUTES and prints them as a human reading — "8m",
 * "1h 21m", "1d 5h". The stored value stays numeric on purpose: a dwell time
 * has a threshold, and `conditional` can only compare numbers. A text column
 * saying "1 day 5 hours" would be unthresholdable, which is how a stalled lead
 * gets to look exactly like a fresh one.
 */
export type ColumnFormat = "number" | "money" | "percent" | "ratio" | "duration" | "text";
/** The comparisons the producer states (`conditions.VALID_OPS`). `gte`/`lte`
 *  used to fall through `meetsCondition` as `gt`, so "at most 3.5" tinted every
 *  row ABOVE 3.5's opposite (review W1, 2026-10-01). */
export type ConditionOp = "lt" | "lte" | "gt" | "gte";
/**
 * The producer's own verdict per column key for ONE row (review W2,
 * 2026-10-01): `true` breaches, `false` does not, `null` could not be judged —
 * no value, or a "N days in a row" rule over days the source did not all
 * report. `null` is neither red nor safe.
 *
 * A run rule cannot be judged from the cell: the cell is the WINDOW figure, and
 * a window CPA of 60 over days 10, 99, 10, 99, 10 is not three days over 50.
 */
export type RowFlags = Record<string, boolean | null>;
/** Cells by column key. `flags`, when present, is the row's verdict rather than
 *  a cell; boards saved before it carry none and are judged from the cells.
 *  COMPARE rows also carry `account_id` and `account_label` cells. */
/** `currency` (optional ISO code, a key outside `columns` like `account_id`) is the row's own
 *  money currency on a COMPARE table; absent → the card's `currency`. */
export type TableRow = Record<string, string | number> & { flags?: RowFlags };
export interface TablePagination {
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  complete: boolean;
  /** `true`: `rows` holds EVERY row of the scope (at most 100), already in
   *  `sort_key`/`sort_dir` order, and the reader pages and sorts them here with
   *  no request. Absent/false: server paging, as before. */
  client?: boolean;
  /** Which scope a client page's total row is the figure for. */
  scope?: "account" | "campaign" | "adgroup";
  sort_key?: string;
  sort_dir?: "asc" | "desc";
}
export interface TableColumn {
  key: string;
  label: string;
  format?: ColumnFormat;
  align?: "left" | "right";
  conditional?: { op: ConditionOp; value: number }; // vd ROAS < 1 → tô đỏ
  /**
   * A threshold that DEPENDS on another column of the same row. OPT-IN — absent
   * keeps `conditional` alone, which is what every table before this uses.
   *
   * One CPI column, two acceptable ceilings: $1.40 on Android and $2.00 on iOS,
   * because the two stores cost different money to buy an install in. A single
   * number cannot express that — set at $1.40 it condemns every iOS row, set at
   * $2.00 it clears Android rows that are 40% over. Splitting CPI into two
   * columns would leave half of each empty.
   *
   * `column` names the row's discriminator; the first case whose `when` equals
   * that cell wins. No match falls back to `conditional`, and no `conditional`
   * means the cell is simply unthresholded.
   */
  conditional_by?: {
    column: string;
    cases: Array<{ when: string; op: ConditionOp; value: number }>;
  };
  // Chỉ số dẫn xuất cho total row: tính lại = Σnum/Σden (× scale), KHÔNG lấy trung bình.
  derived?: { num: string; den: string; scale?: number };
}
export interface TableConfig {
  label?: string;
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** A drilled view's page of its scope (BUG-104-RD-W-13). `total_rows` is the
   *  rows the scope has — or, with `complete: false`, only the rows the source
   *  returned before it stopped. Absent on every other table. */
  pagination?: TablePagination;
  total_row?: TableRow; // nếu vắng → tự tính (số cộng dồn, derived tính lại)
  total_label?: string;
  /**
   * OPT-IN. Report treatment: a header that reads as a header, a separator
   * under every row, a marked row when one of its cells breaches a threshold
   * (see `conditional_highlight`), and columns that keep their width and scroll
   * sideways on a narrow screen instead of being squeezed into two characters
   * each.
   */
  presentation?: WidgetPresentation;
  /**
   * WHAT a breached threshold paints. OPT-IN — absent keeps `"row"`, which is
   * what every board draws today.
   *
   * `"cell"` paints only the cells that actually breach. On a ten-column table
   * a whole-row tint says "something here is wrong" and leaves the reader to
   * find it; worse, it colours Spend and Impressions, which are fine, and a
   * reader scanning for red finds four innocent numbers per bad row.
   */
  conditional_highlight?: "row" | "cell";
  /** Row pairing — see WidgetLayoutRole. Absent → packs as it always did. */
  layout_role?: WidgetLayoutRole;
  /**
   * The producer's sentence when a `conditional` threshold marked EVERY visible
   * row, or none of them. Already localized; absent on every table whose
   * threshold actually separated something, which is almost all of them.
   *
   * A threshold that paints ten of ten rows has ranked nothing, and the reader
   * had no way to tell "everything is on fire" from "this cut is in the wrong
   * place" — the cells look identical either way. The producer can see the
   * whole column, so it says which, and names the observed range so a useful
   * threshold has somewhere to go.
   *
   * Printed BELOW the table rather than as `subtitle`: the subtitle is one
   * truncated line in `WidgetShell` and is already spoken for by the
   * account-total caveat, so a second sentence there would clip the first.
   */
  condition_note?: string;
  /** See `LineChartConfig.unavailable_reason`. */
  unavailable_reason?: LocalizedNote;
}

/**
 * Conversions by weekday × time band.
 *
 * Values are RAW counts; the widget scales them into its own colour ramp. A
 * producer that pre-scaled them would be deciding the visual encoding, which is
 * the widget's job and nobody else's.
 */
export interface HeatmapConfig {
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  label?: string;
  subtitle?: string;
  /** Row labels, already translated. */
  rows: string[];
  /** Column labels, already translated or locale-neutral. */
  columns: string[];
  /** `values[row][column]`. A `null` cell is UNMEASURED, never zero. */
  values: Array<Array<number | null>>;
  /** The thresholds the source declared on the shaded metric: a cell past one is outlined, and the rule is named under the grid. */
  conditions?: unknown;
  /** What the shading measures, already translated — the legend's caption. */
  metric_label?: string;
  /** A one-line reading of the peak. */
  summary?: string;
  /** The two ends of the shading scale, in words. A one-hue ramp is ordered by
   *  construction, but only a reader who is told which end is which knows it. */
  legend?: { low: string; high: string };
  /**
   * Column indices that fall OUTSIDE the client's working hours.
   *
   * Drawn on a neutral ground that is not a step of the intensity ramp: a cell
   * outside the service window still counts as a submission but is excluded
   * from the response commitment, and shading it with the ramp would say those
   * two things are the same. The indices come from the BOARD — a working window
   * is the client's configuration, not the widget's.
   */
  off_hours_columns?: number[];
  /** What the neutral ground means, in words. Required whenever the mask is. */
  off_hours_note?: string;
  /**
   * How a cell PRINTS its number — the same union a table column carries, and
   * stamped by the same `_column_format(metric)` the KPI card reads.
   *
   * The grid used to interpolate the raw value, so one board printed the one
   * quantity three ways: `$6,628.84` on the card, `$109.51` in the table, and
   * `51` / `114.2` / `109.51` in this grid, ragged because `String(number)`
   * drops trailing zeros and knows no currency. Declaring the format here lets
   * the cell go through `formatByColumn`, so a heatmap cell and a table cell of
   * the same metric cannot disagree.
   *
   * OPTIONAL, and absent on every board saved before 2026-09-17 — those fall to
   * `formatByColumn`'s own default, exactly as an un-formatted column does.
   */
  format?: ColumnFormat;
  /**
   * The short form of each column header — SAME LENGTH AND ORDER as `columns`.
   *
   * `columns` stays the column's IDENTITY (the ISO day, `2026-09-10`): it is
   * the React key, the tooltip's unambiguous reading, and what a mask index
   * refers to. This is only how that identity is DISPLAYED (`10/9`), because a
   * month of ISO days does not fit a header row.
   *
   * Taken wholesale or not at all — see the renderer: a list of a different
   * length means the producer's two arrays are misaligned, and pairing them by
   * index would then print one column's label over another's data.
   */
  column_labels?: string[];
  /**
   * One already-translated sentence saying the ROW list was capped — "12 of 37
   * ads". Rendered next to the rows it is about, never next to `summary`,
   * which reads the peak.
   *
   * Already localized. The renderer prints it and never builds it: the producer
   * owns wording, and a widget that composed "N of M" would be a second place
   * the product speaks from.
   */
  row_note?: string;
  presentation?: WidgetPresentation;
  /** Row pairing — see WidgetLayoutRole. Absent → packs as it always did. */
  layout_role?: WidgetLayoutRole;
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}

/**
 * The heatmap FRAME (2026-10-10): the producer decided rows, columns, metric,
 * colour mode, threshold, sort and which cells print, and sends every cell's
 * colour position already computed. The renderer reads nothing into a metric
 * name — it draws `pos`, `mark` and `show` as sent.
 *
 * Boards saved before the frame carry `HeatmapConfig` (string rows/columns and
 * raw `values`); `isHeatmapFrame` tells the two apart so they keep rendering.
 */
export interface HeatmapFrameCell {
  /** The measured value; `null` is MISSING data, drawn empty, never 0. */
  v: number | null;
  /** Colour position 0..1 on the frame's scale; `null` when `v` is. */
  pos: number | null;
  /** Past the frame's threshold. */
  mark: boolean;
  /** Print the value in the cell; otherwise it is only in the tooltip. */
  show: boolean;
}

export type HeatmapFrameValue =
  { metric: string; label?: string; format?: string; good_direction?: "up" | "down" | null };

export interface HeatmapFrameConfig {
  type?: "heatmap";
  label?: string;
  subtitle?: string;
  /** ISO currency of the account, for a money format. */
  currency?: string;
  value: HeatmapFrameValue;
  rows: { dimension: string; items: Array<{ id: string; label: string }>; hidden?: number };
  columns: { dimension: string; items: Array<{ key: string; label: string }>; binned?: string };
  /** Row-major, `cells[row][column]`. */
  cells: HeatmapFrameCell[][];
  color: { mode: string; scale: "sequential"; legend?: { low: string; high: string } };
  marks?: { threshold: number | null; side: "above" | "below" | null };
  presentation?: WidgetPresentation;
  layout_role?: WidgetLayoutRole;
  height_policy?: WidgetHeightPolicy;
  unavailable_reason?: LocalizedNote;
}

/** A frame slot: structured row/column items and a cell grid. Anything else
 *  is a board saved before the frame and takes the legacy renderer. */
export function isHeatmapFrame(c: unknown): c is HeatmapFrameConfig {
  if (!c || typeof c !== "object") return false;
  const x = c as { rows?: unknown; columns?: unknown; cells?: unknown };
  return (
    Array.isArray((x.rows as { items?: unknown } | undefined)?.items) &&
    Array.isArray((x.columns as { items?: unknown } | undefined)?.items) &&
    Array.isArray(x.cells)
  );
}

/**
 * How a widget pairs with the one after it on the grid.
 *
 * OPT-IN and orthogonal to `presentation`: a colour scheme is not a statement
 * about column widths, and the layout engine used to read one as the other.
 * `dominant` leads a row, `companion` explains it, and the engine draws them
 * 8/4 when both still clear their own minimum width.
 */
/**
 * How a widget's grid cell is SIZED.
 *
 * OPT-IN. Absent, a cell keeps the policy it has always had: a bounded widget
 * takes a definite height, everything else takes a `layout.h × 76` floor.
 *
 * `"content"` removes the floor and lets the card be exactly as tall as what it
 * draws. A floor is a guess made by the builder, which knows the slot's `h` but
 * not its WIDTH — and the same card is one row of readings at 8/12 on a desktop
 * and three rows at 12/12 on a phone. One number cannot be right for both, and
 * when it is too large the difference is whitespace the card cannot shrink out
 * of. Content sizing makes the question disappear rather than answering it
 * twice.
 *
 * It is safe only where the widget draws its own height honestly — a chart
 * needs a definite parent, and a table needs a scroll ceiling, so neither takes
 * this.
 */
export type WidgetHeightPolicy = "content";

export type WidgetLayoutRole = "dominant" | "companion";

/**
 * A whole, split into named parts.
 *
 * A ranking with `numbered: false` was standing in for this and could not do
 * the one thing the shape needs: show that the parts ARE the whole. The stacked
 * bar across the top is that claim — four segments, one row, no gaps — and the
 * rows beneath name each part with its count and share.
 *
 * Every part carries its share in WORDS as well as width, and a part that needs
 * attention carries a marked label, so neither the segment lengths nor their
 * colours are the only way to read it.
 */
export interface DistributionConfig {
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  label?: string;
  subtitle?: string;
  /** The whole. Stated, not summed from the segments: a producer whose parts do
   *  not add up to its own total is a bug this makes visible instead of hiding
   *  behind a bar that always looks full. */
  total: number;
  total_label?: string;
  segments: Array<{
    label: string;
    value: number;
    /** Percent of `total`, as the producer computed it. */
    share: number;
    /** Marks a part that needs attention. Rendered as a word AND a colour. */
    alert?: boolean;
    /** A short reading under the label. */
    note?: string;
  }>;
  layout_role?: WidgetLayoutRole;
  presentation?: WidgetPresentation;
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}

/**
 * A compact list of integrations and whether each is running.
 *
 * A six-column table is the wrong shape at a third of a row: it scrolls
 * sideways to show four rows of short values. This is the same information as a
 * list — name and state on one line, the numbers that qualify the state on the
 * next — which fits the column the board actually gives it.
 *
 * `state_text` is always rendered. The tone tints the row and draws a glyph;
 * neither is ever the only signal.
 */
export interface StatusListConfig {
  label?: string;
  subtitle?: string;
  rows: Array<{
    name: string;
    state_text: string;
    state_tone: "healthy" | "delayed" | "error";
    /** Typed pairs — latency, retries, last sync. Never a sentence to parse. */
    meta: Array<{ label: string; value: string }>;
    detail?: string;
  }>;
  layout_role?: WidgetLayoutRole;
  presentation?: WidgetPresentation;
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}

/**
 * Age, gender, region and the segment that qualifies best, in ONE shell.
 *
 * Three separate ranking cards said three things the reader has to add up
 * themselves, and took a whole row to do it. The board's question is "who is
 * this working on", which is one question.
 *
 * Each group's shares are the producer's own and are printed as numbers beside
 * their bars; nothing here is derived by parsing a label.
 */
export interface AudienceSummaryConfig {
  label?: string;
  subtitle?: string;
  groups: Array<{
    label: string;
    /** `share` is a percent of the group, which must total 100. */
    rows: Array<{ label: string; share: number; note?: string }>;
  }>;
  /** The one sentence the groups add up to. */
  highlight?: { label: string; value: string; note?: string };
  /**
   * How the groups sit. OPT-IN — absent stacks them, which is what a card in a
   * third of a row needs.
   *
   * `columns` puts age, gender and region side by side, which is what the
   * approved design does when the card takes two thirds of the row. It is a
   * responsive grid, not three fixed widths: below the point where a column
   * stops being readable they wrap to two, then to one.
   */
  layout?: "stacked" | "columns";
  layout_role?: WidgetLayoutRole;
  presentation?: WidgetPresentation;
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}


/**
 * The same funnel, modelled three ways, side by side.
 *
 * A lead operation can be wired as form-only, private-message-only, or form
 * then message then deal, and which one a client is on changes what every stage
 * below it MEANS. Drawing only the active chain hides that choice; drawing the
 * three alternatives beside it makes the configuration visible and shows what
 * the unused ones would measure.
 *
 * Text sits INSIDE each bar and centred, which is safe here because these bars
 * are a stacked ladder, not a proportional-width encoding: every stage in a
 * mode gets the same box, and the NUMBER is what carries the size. The
 * proportional funnel is the other widget (`funnel`), and it keeps its text
 * outside the bar for exactly the reason this one does not have to.
 */
export interface FunnelModesConfig {
  label?: string;
  subtitle?: string;
  modes: Array<{
    key: string;
    /** "Mode A", already translated. */
    name: string;
    /** What this wiring measures, one line. */
    caption?: string;
    active?: boolean;
    /** A mode the client has not switched on: drawn, but greyed and labelled. */
    disabled?: boolean;
    stages: Array<{
      label: string;
      /** `null` when this mode cannot report the stage at all. */
      value: number | null;
      /** Step rate against the stage above, already computed. */
      rate?: string;
      /** From CRM / IM rather than the ad platform. */
      supplemental?: boolean;
      /** A stage the mode declares but does not measure. */
      unavailable?: boolean;
    }>;
  }>;
  /** The one or two figures the card totals to, under the panels. */
  footnotes?: Array<{ label: string; value: string }>;
  layout_role?: WidgetLayoutRole;
  presentation?: WidgetPresentation;
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}

export interface SectionHeaderConfig {
  title: string;
  subtitle?: string;
  /** The source this group opens, on a board that reads several (one widget =
   *  one platform): the header shows its mark and how fresh ITS data is.
   *  Set by the producer; absent on every other header. */
  source?: string;
  /** Which numbered group this is. OPT-IN: absent → no numeral, which is every
   *  header authored before this. Counted by the builder over the board, so it
   *  cannot drift out of step with the order the sections are actually in. */
  index?: number;
  /** OPT-IN report treatment: the report palette's own surface and ink, and a
   *  cell that hugs the header instead of standing 76px tall over the thing it
   *  introduces. Absent → the header every other board has always drawn. */
  presentation?: WidgetPresentation;
  /**
   * Hug the header's own content instead of taking a floor from `layout.h`.
   *
   * A header is ~40px of text in a cell `layout.h = 1` gives a 76px floor, and
   * the extra 36px reads as distance between the title and the very thing it
   * introduces — the header drifts towards the group ABOVE it. The report
   * treatment already hugs via `presentation`; this says the same thing without
   * bringing the report palette with it, so an ordinary template header can be
   * fixed without restyling every other widget on its board.
   *
   * Set by `buildDetailSection` on template headers. Absent on a raw producer
   * slot, which keeps the floor it has always had. See WidgetHeightPolicy.
   */
  height_policy?: WidgetHeightPolicy;
}

// ── goal_gauge ─────────────────────────────────────────────────────────────
// Vòng tròn tỷ lệ hoàn thành. good_direction=down ⇒ pct = min(goal/actual,1)×100
// (chặn trần 100 ở producer); tỷ lệ thật (>100) ghi ở value_label/diff_text.
export interface GoalGaugeConfig {
  label: string;
  subtitle?: string;
  actual?: number;
  goal?: number;
  good_direction?: "up" | "down";
  pct?: number; // 0..100, phần lấp vòng tròn (đã chặn trần)
  value_label?: string; // "Thực tế 2.81"
  diff_text?: string; // "Đạt 106.8% (goal ÷ actual) · cách trần −0.19"
  estimate_note?: string; // pill "Giá trị ước tính · lấy quyết toán làm chuẩn"
  unit?: string;
  metric?: Metric;
  /** OPT-IN report treatment. Also what lets a ROW of gauges tile the grid
   *  exactly (see `isReportGauge` in layoutEngine) — a board that says nothing
   *  keeps the two-per-row rule and the frozen palette. */
  presentation?: WidgetPresentation;
  /**
   * How the card is DRAWN. Absent → the ring, with byte-identical markup to
   * every gauge authored before this.
   *
   * Three shapes because three different questions are being asked, and one
   * ring answered all of them badly:
   *  - `ring`     — progress towards a target you climb to (169 of 300).
   *  - `progress` — a RATE, whose headline is the percentage itself and whose
   *                 bar is that same percentage (91 of 169 = 54%).
   *  - `sla`      — a measurement against a commitment, where the headline is
   *                 the measurement in its own unit ("12 min"), the target is
   *                 stated beside it, and the bar is a SEPARATE figure (the
   *                 share answered inside the commitment) that has nothing to
   *                 do with actual ÷ goal.
   *  - `pacing`   — SEVERAL budgets, each read against how much of its period
   *                 has elapsed. See `tracks`.
   */
  display?: "ring" | "progress" | "sla" | "pacing";
  /**
   * Budgets read against elapsed time. OPT-IN, and only meaningful with
   * `display: "pacing"`.
   *
   * A spend bar alone says nothing: 78% of today's budget is fine at 20:00 and
   * alarming at 15:40. What makes it readable is the SECOND number — the share
   * of the period that has passed — drawn as a mark on the same track, so the
   * comparison is a glance rather than arithmetic. The gap between the two is
   * stated in points, in words, and the verdict is a word before it is a
   * colour.
   *
   * Several tracks because a monthly and a daily budget can disagree, and the
   * disagreement is the finding: on pace for the month, 13 points ahead today.
   */
  tracks?: Array<{
    /** "Monthly budget $50,000 · spent $6,800" — the producer's own line. */
    label: string;
    /** How far the SPEND has got, 0-100. */
    pct: number;
    /** How far the PERIOD has got, 0-100. Drawn as a mark on the same track. */
    reference_pct: number;
    /** What that mark is, in words — "time elapsed 13.3%". */
    reference_label: string;
    /** The gap between the two, already signed and united ("+13pt"). */
    delta_text?: string;
    /** The verdict in words. Always rendered, so the tone is never alone. */
    state_text: string;
    state_tone: "positive" | "warning" | "critical";
  }>;
  /** Columns this card takes when its row is not evenly divided. OPT-IN — see
   *  `isReportGauge` / `declaredSpans` in layoutEngine. */
  layout_span?: number;
  /**
   * The bar's own figure, 0–100, when it is NOT actual ÷ goal.
   *
   * The SLA card is the case that forced it: 12/15 = 80% is arithmetic on two
   * numbers that never meant a completion, while 78% — the share answered
   * inside 15 minutes — is a real measurement the producer already has. It
   * arrives as a typed field; nothing reads it out of a subtitle.
   */
  progress_pct?: number;
  /** What `progress_pct` measures, in words. */
  progress_label?: string;
  /** Unit for the headline and the target, in words ("min"). */
  unit_label?: string;
  /** The headline, already formatted ("1 min 08 s"). Replaces the numeric
   *  headline; `actual`/`goal` stay numeric so the status is still computed. */
  headline_text?: string;
  /** The target, stated beside the headline ("≤ 15 min"). */
  target_label?: string;
  /** Whether the goal was MET, decided by `good_direction` (see `goalMet`) —
   *  never by the sign of actual − goal. */
  status_text?: string;
  /** Which semantic the status carries. The word is always rendered, so the
   *  colour is a second signal and never the only one. */
  status_tone?: "positive" | "warning" | "critical";
  /** Extra readings under the headline — the tail an average hides ("over 30
   *  min: 9"), the staffing behind a commitment. Typed pairs, so nothing has
   *  to be parsed back out of a sentence. */
  supporting?: Array<{ label: string; value: string }>;
  /** Vắng mục tiêu (không lượt nào nêu) hoặc nguồn không có chỉ số — ô vẫn ở
   *  lại trên bảng và tự nói lý do, thay vì biến mất như trước 2026-08-28. Khi
   *  có field này thì `pct` vắng, nên `GoalGauge` đã tự hạ về state empty. */
  unavailable_reason?: LocalizedNote;
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}

// ── ranking ────────────────────────────────────────────────────────────────
export interface RankingRow extends AccountTagged {
  /** ISO currency of this row's money (COMPARE); absent → the card's `currency`. */
  currency?: string;
  label: string;
  sublabel?: string;
  thumbnail?: string;
  value: number;
  bar_pct: number; // 0..100 độ dài thanh tiến độ
  alert?: boolean; // vượt ngưỡng → thanh + giá trị tô đỏ
  /**
   * Mức nghiêm trọng của dòng. OPT-IN, và chỉ có nghĩa ở ranking báo cáo.
   *
   * `alert` là một công tắc hai trạng thái, nhưng một hàng đợi theo dõi có ba
   * bậc: quá hạn (đỏ), sắp quá hạn (vàng) và bình thường (trung tính). Đỏ cho
   * cả ba là đỏ không còn nghĩa gì. Chữ trên dòng vẫn nói đủ, nên màu là tín
   * hiệu thứ hai.
   */
  severity?: "critical" | "warning" | "normal";
}
export interface RankingConfig {
  label?: string;
  /** ISO currency of the account (producer `config.currency`); money prints
   *  with its symbol. Absent on boards saved before 2026-09-29 → `$`. */
  currency?: string;
  subtitle?: string;
  format?: ColumnFormat;
  rows: RankingRow[];
  /** The thresholds the source declared on the ranked metric, as the producer attached them: drawn as a line under the list. */
  conditions?: unknown;
  /** Whether rows carry a rank numeral. Absent → they do, as they always have.
   *  A distribution (age bands, a form's fields in form order) sets this false:
   *  the rows have an order, but it is not a ranking. */
  numbered?: boolean;
  /** OPT-IN report treatment: the report palette, and no striped placeholder
   *  where a row has no thumbnail — a list of form fields or age bands has no
   *  picture to show, and six empty grey squares are six pieces of furniture.
   *  Absent → the ranking every other board has always drawn. */
  presentation?: WidgetPresentation;
  /** Row pairing — see WidgetLayoutRole. Absent → packs as it always did. */
  layout_role?: WidgetLayoutRole;
}

// ── scatter_bubble ─────────────────────────────────────────────────────────
// Bán kính co giãn theo √ ở renderer (r là giá trị thô). y_is_cost ⇒ đảo ngữ
// nghĩa góc phần tư (thấp = tốt). Đường tham chiếu luôn kèm nguồn baseline.
export interface ScatterPoint extends AccountTagged {
  label: string;
  x: number;
  y: number;
  r: number;
  alert?: boolean;
  show_label?: boolean;
  /** ISO currency of the account this item reads (COMPARE boards only):
   *  accounts are never converted, so each item keeps its own. */
  currency?: string;
}
export interface QuadrantRef {
  /**
   * The line's position. Absent when the producer sent `by_currency` instead:
   * a COMPARE board whose accounts bill in different currencies on a money
   * axis has no single reference — see `refForCurrency` (compareScatter.ts).
   */
  value?: number;
  /** Per-currency references (ISO code → line), sent instead of `value` when currencies differ. */
  by_currency?: Record<string, { value: number; source?: string }>;
  /**
   * WHAT the dashed line is, so the footnote can say it. OPT-IN.
   *
   * The field has always existed and nothing ever set it, so the widget printed
   * one fixed sentence — "Dashed = account average" — over every scatter. Two
   * Community boards do not draw an account average: the propagation matrix
   * draws MEDIANS, and the follower-efficiency matrix draws the mean of the
   * plotted groups on X against the account average on Y.
   *
   * Values the widget recognises are listed in `BASELINE_SOURCES`
   * (ScatterBubble.tsx). Absent OR unrecognised keeps the legacy copy, because
   * a producer payload is not required to declare one and an unknown string
   * must not blank the footnote.
   */
  source?: string;
}
export interface ScatterBubbleConfig {
  label?: string;
  subtitle?: string;
  x_label: string;
  y_label: string;
  /** What the bubble RADIUS encodes — the chart's third dimension, which had no
   *  legend and so read as decoration. Optional: older payloads omit it. */
  r_label?: string;
  /**
   * Which metric each dimension IS, as keys (BUG-102-RD-X-04): the labels are
   * words in one language, and a value prints in its metric's unit — the
   * account's currency for spend, two decimals for a rate. Optional: boards
   * saved before them fall back to the binding's metric (X) and an exact
   * vocabulary name match (`metricKeyForName`), else print as before.
   */
  x_metric?: string;
  y_metric?: string;
  r_metric?: string;
  /** ISO currency of the account (producer `config.currency`). Absent: a money
   *  value prints its amount with NO symbol — never an assumed `$`. */
  currency?: string;
  /**
   * WHAT A RED BUBBLE MEANS, so the legend can say it.
   *
   * `ScatterPoint.alert` is a bare boolean, so the legend could only ever print
   * "Red = over threshold" — a sentence sitting directly under an axis captioned
   * CPM, which every reader takes to mean "over the CPM threshold". Measured on
   * the reach × CPM board of 2026-09-18: the two red bubbles were NOT the two
   * highest CPM, and the highest-CPM bubble of the six was blue. The threshold
   * was on a metric that appears nowhere on the chart, so the colour actively
   * taught the reader something false — worse than saying nothing.
   *
   * Both OPT-IN and read together: a metric with no number, or a number with no
   * metric, cannot form the sentence, so either alone keeps the legacy copy.
   * Every board that shipped before this keeps the legend it shipped.
   */
  alert_metric?: string;
  alert_threshold?: number;
  /** How to print `alert_threshold` — the same `_column_format` key the tables
   *  and ranking rows already carry, so one number is not formatted two ways on
   *  one board. Absent → `formatCompact`, the widget's own default. */
  alert_format?: string;
  /**
   * EVERY rule that can paint a bubble red, already worded by the producer.
   *
   * `alert_metric`/`alert_threshold` only ever covered a board with ONE plain
   * threshold; anything else fell back to "Red = over threshold", which is the
   * common case because the producer derives one rule per cost metric. A
   * reader who did not set the number and cannot see it has no way to tell
   * what the colour means — and the nearest number to the legend is whatever
   * axis sits above it, which is how the vague wording got misread as the CPM
   * threshold on a CPM chart.
   *
   * A SENTENCE, not the rules: `conditions` carries internal row keys
   * (`cost_per_result_delta_pct`) and operators (`gt`), and a renderer taught
   * to word those would be a second place that has to know what a derived
   * deterioration rule means. Preferred over `alert_metric` when both arrive.
   */
  alert_rule_text?: string;
  y_is_cost?: boolean;
  ref_x: QuadrantRef;
  ref_y: QuadrantRef;
  /**
   * READING ORDER, not clockwise: `[top-left, top-right, bottom-left,
   * bottom-right]` — the widget destructures it as `const [tl, tr, bl, br]`.
   *
   * Spelled out because a board did read it as clockwise and shipped its two
   * bottom labels swapped, which put "high volume" under the low-volume half of
   * its own x axis. The mistake is invisible on screen: four plausible phrases
   * in four corners look fine until you check one against the axis it sits on.
   */
  quadrants: [string, string, string, string];
  points: ScatterPoint[];
}

// ── media_card ─────────────────────────────────────────────────────────────
// aspect do config quyết định, KHÔNG trộn trong cùng một nhóm. Nhấp → deep_link.
export interface MediaCardConfig extends AccountTagged {
  /**
   * `1:1` is the store-listing shape: an in-app product's artwork is square
   * because that is what the store renders, and forcing it into 9:16 would
   * letterbox every icon on the shelf. Added as a third value rather than a
   * second widget — a product card and a creative card differ in what they
   * SHOW, not in how they are built. Anything else keeps 9:16, so the three
   * walls authored before this are untouched.
   */
  aspect: "9:16" | "16:9" | "1:1";
  media_url?: string;
  /** Which measure `badge_value` is. It NAMES the number on the poster: without
   *  it the badge is a bare figure ("2000.08") whose metric and unit the reader
   *  has to guess (BUG-103-RD-W-01). */
  badge_metric?: Metric;
  /**
   * The badge's figure. A STRING is already formatted by the producer ("612k")
   * and is printed verbatim; a NUMBER is the raw measure and is read through
   * `badge_metric`, so it gains that metric's own unit and precision rather
   * than a guessed one. The producer sends a number.
   */
  badge_value?: string | number;
  /**
   * NOT DRAWN (BUG-103-RD-W-01, reopened). The producer sent the row's name
   * here — on a creative wall the stored video's file name — and the tile
   * printed it over the poster. Kept on the type because saved boards carry it.
   */
  overlay_text?: string;
  /** The ad's own name, from the source's `ad_name` field; printed verbatim. */
  ad_name?: string;
  /** The card's 1-based place in the wall's sort (the producer's ranking). */
  rank?: number;
  /** A title the reader typed in the edit form, marked by `label_by_reader`. */
  label?: string;
  label_by_reader?: boolean;
  /**
   * What the card IS, in business terms.
   *
   * OPTIONAL because the producer has never sent it: the wall's tiles carried
   * only `overlay_text`, which on a real account is the source's filename
   * ("下載 (7).mp4"), so six tiles had no heading at all. The renderer falls
   * back to the tile's own metric name — which is data the card already
   * carries, not invented metadata — and the filename stays the secondary line
   * it always was.
   */
  title?: string;
  sublabel?: string; // "Lên sóng 12 ngày · tần suất 3.0"
  value?: number;
  delta?: number; // % so kỳ trước
  good_direction?: "up" | "down";
  deep_link?: string;
  metric?: Metric;
  /**
   * OPT-IN. Frames the tile and puts the delivery figures INSIDE that frame, so
   * a wall of six reads as six monitored creatives rather than six captions
   * under six pictures. Absent — the three walls authored before this — renders
   * exactly the markup the widget always produced.
   */
  presentation?: WidgetPresentation;
  /**
   * What the status word MEANS, so it can be coloured. OPT-IN and independent
   * of `presentation`: without it `sublabel` stays the muted line it has always
   * been.
   *
   * A tone rather than a status name, because the words differ per board while
   * the four levels of "how worried should I be" do not.
   */
  /**
   * What the asset IS.
   *
   * OPT-IN, and the play button is drawn unless this says `"image"` — the three
   * walls authored before this field carry no media type and must keep the
   * affordance they have always had. Never inferred from the file extension or
   * the URL: a producer that names a still `clip-final.jpg` would otherwise get
   * a play button on a picture, and a signed CDN URL carries no extension at
   * all.
   */
  media_type?: "video" | "image";
  /**
   * The one figure a buyer scans a wall FOR, printed over the poster's top
   * right. OPT-IN — absent draws nothing, which is every wall before this.
   *
   * `tone` carries whether it breached its target; the value itself is always
   * printed, so the colour is a second reading rather than the only one.
   */
  corner_badge?: { text: string; tone?: "good" | "neutral" | "warn" | "bad" };
  /**
   * Where `deep_link` points. OPT-IN — absent means `"external"`, which is what
   * every wall before this sent and what the platform-content links it carries
   * need.
   *
   * `"internal"` is a route in THIS app, so it must not open a new tab: the
   * reader is navigating, not leaving. Same anchor, no `target`, no `rel`.
   */
  link_scope?: "external" | "internal";
  status_tone?: "good" | "neutral" | "warn" | "bad";
  /**
   * Supporting readings that belong to this creative — impressions, clicks,
   * spend, CPL — as label/value pairs already translated and formatted by the
   * producer. Kept out of `value`, which is the tile's ONE headline number.
   */
  stats?: Array<{ label: string; value: string }>;
  /**
   * Why this wall holds no card, for a `state: "empty"` slot — the producer's
   * own sentence ("the source returned no ads carrying creative"), printed as
   * the body of the cell instead of the shell's generic "no data in the
   * selected period".
   *
   * Same field, same contract as every other widget that can be refused
   * (`FunnelConfig`, `LineChartConfig`, …). It reaches the reader only through
   * MediaCard's empty branch: a wall with cards ignores it, because a tile that
   * drew a poster has nothing to be sorry about.
   */
  unavailable_reason?: LocalizedNote;
  /** The producer's id/name/kind of the creative this card shows. */
  id?: string;
  creative_id?: string;
  creative_name?: string;
  creative_type?: string;
  /**
   * A whole wall in ONE widget: one card config per creative, sorted and capped
   * by the producer. When present (>= 1) the widget draws a grid of them; the
   * top card's fields are also copied onto this config (the single-card shape).
   */
  /** ISO currency of the account a COMPARE wall item reads; its figures print in it. */
  currency?: string;
  creative_items?: MediaCardConfig[];
}

// ── live_status_bar (kết cấu, không bind metric) ────────────────────────────
export interface LiveStatusBarConfig {
  live: boolean;
  session_title: string;
  detail?: string; // "Lên sóng 20:06 · Đã phát 2 giờ 30 phút · Host …"
  refresh_text?: string; // "Tự làm mới mỗi 60 giây"
}

// ── note (kết cấu, không bind metric) ───────────────────────────────────────
// Nơi đáp xuống của clarify (hỏi lại + chips), meta (ghi cửa sổ quy kết) và
// refuse (từ chối app/metric/dim ảo giác + liệt kê chiều khả dụng).
export type NoteKind = "clarify" | "meta" | "refuse";
export interface NoteChip {
  label: string;
  value: string;
}
export interface NoteConfig {
  kind: NoteKind;
  title: string;
  body?: string;
  chips?: NoteChip[];
  available_dims?: string[];
  /** Cell sizing. Absent → the floor this widget has always had.
   *  See WidgetHeightPolicy. */
  height_policy?: WidgetHeightPolicy;
}
