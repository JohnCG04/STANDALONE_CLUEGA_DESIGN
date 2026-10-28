/**
 * Per-widget threshold alerts: the rule, where it lives, and the ONE place a
 * widget's monitored number is resolved.
 *
 * SCOPE. This is visual, foreground-only highlighting on the owner's own
 * dashboard. There is no background evaluation and no delivery channel —
 * nothing here notices a breach while the reader is away. It does not replace
 * or extend Pulse alert rules, which are a separate, server-side product with
 * their own lifecycle.
 *
 * TWO KINDS OF RULE (BUG-109-RD-L-02, 2026-10-08). A rule saved before then
 * names no frequency: it is judged at render, off the number the widget is
 * already showing, exactly as it always was (`evaluateAlertRule`). A rule
 * saved since states how often it is CHECKED (15 / 30 / 60 minutes) and after
 * how many checks in a row it fires (N); it is judged ONLY by those checks,
 * which `alertChecks` runs while the owner's board is open — never at render,
 * so a re-render can neither fire nor count it.
 *
 * WHERE IT LIVES, AND WHY NOT A TOP-LEVEL SLOT FIELD. `alert_rule` is stored
 * inside `config`, not beside `binding`. The CDP definition decoder runs
 * `DisallowUnknownFields` over the slot, so a new top-level key is refused on
 * save until three repositories ship in lockstep — the backend says so itself,
 * having already been bitten by `binding.goal` making every goal_gauge board
 * unsavable. `config` is `json.RawMessage` there and the validator deliberately
 * does not recurse into it, which is what lets a front-end-owned field exist at
 * all. `refreshMerge`'s READER_OWNED_CONFIG_KEYS is the matching mechanism on
 * this side, and already carries the reader's `conditions` for the same reason.
 * So the rule is config-nested by the codebase's own convention, and the
 * backend needs no change to persist or validate it.
 *
 * NO STORED `breached` FLAG. Breach is derived, every render, from the slot's
 * current numbers and the saved rule. A persisted boolean would be a second
 * source of truth that goes stale the moment a refresh lands — and the bug it
 * produces ("this card says ALERT and the number is fine") is worse than the
 * feature.
 *
 * 【中文】門檻警示只在擁有者開著儀表板時、依畫面上已有的數字即時判斷；不寄信、不輪詢。
 */
import { bindingMetrics, bindingSource, type WidgetSlot, type WidgetType } from "@/components/dashboard/widgets/types";
import { readPeriod } from "@/components/dashboard/widgets/widgetPeriod";
import { numberOrNull } from "@/lib/dashboard/drivers";
import { slotConfig } from "@/lib/dashboard/slotConfig";
import { metricIsNonNegative, metricsForApp } from "@/lib/dashboard/vocabulary";

/** The comparisons a rule may state. Allowlisted — nothing else is accepted. */
export const ALERT_OPERATORS = ["gt", "gte", "lt", "lte", "eq"] as const;
/**
 * An alert's own operator set. NOT `ConditionOp`: a table cell's condition
 * (`meetsCondition`) is shared by every widget that marks rows, and "equal"
 * means nothing there; the alert keeps its own comparator so adding one here
 * cannot change how a single table row is marked (BUG-109-RD-L-02).
 */
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

/**
 * Whether `value` meets `operator threshold`, as NUMBERS.
 *
 * Never on formatted text: "$18.4K" is not 18.4, and "1.49%" is not 1.49 of
 * anything until the unit is known — the rule compares the number the producer
 * sent with the number the reader typed, in the same unit.
 *
 * Equality is numeric with a tolerance for binary floating point ONLY: a few
 * units in the last place of the larger operand (`4 · Number.EPSILON`,
 * relative). 0.1 + 0.2 equals 0.3; 1 000 000 000.5 does NOT equal
 * 1 000 000 000, and 0 equals only ±0. It is not a business "close enough" and
 * does not round to a display precision — "equal" is not "prints the same".
 * (A relative 1e-9 used to stand here and called 1 000 000 000.5 equal to
 * 1 000 000 000 — BUG-109-RD-L-02 review.)
 */
/** How many units in the last place `eq` forgives — binary rounding only. */
const EQUAL_ULPS = 4;

export function compareAlertValue(value: number, operator: AlertOperator, threshold: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) return false;
  switch (operator) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold
        || Math.abs(value - threshold) <= EQUAL_ULPS * Number.EPSILON * Math.max(Math.abs(value), Math.abs(threshold));
    default:
      return false;
  }
}

/** How often a scheduled rule is checked while the board is open, in minutes. */
export const ALERT_FREQUENCY_MINUTES = [15, 30, 60] as const;
export type AlertFrequency = (typeof ALERT_FREQUENCY_MINUTES)[number];
/** The frequency a NEW rule starts on. */
export const DEFAULT_ALERT_FREQUENCY: AlertFrequency = 30;

/**
 * One widget's threshold rule, as persisted inside `config.alert_rule`.
 *
 * `metric` is the CANONICAL identifier from the widget's binding/config — never
 * a translated label and never a rendered string. It is stored so the rule can
 * be checked against the widget's metric set later: an Edit that rebinds the
 * widget leaves a rule that no longer describes anything, and a rule whose
 * metric is not the widget's must not be evaluated.
 *
 * `threshold` is a finite number. NaN and ±Infinity are rejected at every
 * boundary — they compare in ways no reader intends (`NaN > x` is always false,
 * so a NaN rule is a rule that silently never fires).
 */
export interface WidgetAlertRule {
  enabled: boolean;
  metric: string;
  operator: AlertOperator;
  threshold: number;
  /**
   * How often the rule is CHECKED while the owner's board is open. Absent on a
   * rule saved before 2026-10-08: that rule is judged at render, as before,
   * and is never polled (`isScheduledAlertRule`).
   */
  frequency_minutes?: AlertFrequency;
  /**
   * How many checks in a row must meet the condition before the alert shows
   * — a whole number ≥ 1. Stated together with `frequency_minutes`.
   */
  consecutive?: number;
  /**
   * Send the breach to a Lark group too (BUG-130, foreground): the board asks
   * the server for one message per breach, while it is open and visible. A
   * channel is one of the workspace's delivery channels, by id — never a
   * webhook. Absent on every rule saved before, which only shows on the board.
   */
  lark?: AlertLarkDelivery;
  /**
   * Email the breach too (BUG-130, foreground): one mail per recipient per
   * breach, asked by the open, visible board; the server checks every address.
   * Absent on every rule saved before, which sends no mail.
   */
  email?: AlertEmailDelivery;
  /**
   * The link the Lark message and the email open: the board in the app
   * (`internal`, also what an absent field means — every rule saved before),
   * or the board's EXISTING share link (`share`), chosen by its owner and
   * used only while it is live when sent. The server never makes one for it.
   */
  link?: AlertLinkKind;
}

/** Which link an alert's message opens (`WidgetAlertRule.link`). */
export type AlertLinkKind = "internal" | "share";

export function isAlertLinkKind(value: unknown): value is AlertLinkKind {
  return value === "internal" || value === "share";
}

/** Where a rule's breach is sent in Lark. */
export interface AlertLarkDelivery {
  enabled: boolean;
  channel_id: string;
}

/** Who a rule's breach is emailed to: plain addresses, lower-cased, no repeats. */
export interface AlertEmailDelivery {
  enabled: boolean;
  recipients: string[];
}

/** How many addresses one rule may email (the server holds the same limit). */
export const MAX_ALERT_EMAIL_RECIPIENTS = 10;

/** RFC 5321's limit on an address. */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** One plain mailbox, trimmed and lower-cased; null for anything else. */
function normalizeAlertEmail(raw: string): string | null {
  const address = raw.trim();
  if (!address || address.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(address)) return null;
  return address.toLowerCase();
}

/**
 * Recipients typed as free text (commas, semicolons, spaces or new lines):
 * the valid ones normalized, in order, without repeats; the rest as typed.
 */
export function parseAlertEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) continue;
    const address = normalizeAlertEmail(part);
    if (address === null) invalid.push(part);
    else if (!valid.includes(address)) valid.push(address);
  }
  return { valid, invalid };
}

/** A rule judged by its checks: one that states a frequency (and its N). */
export type ScheduledAlertRule = WidgetAlertRule & { frequency_minutes: AlertFrequency; consecutive: number };

export function isScheduledAlertRule(rule: WidgetAlertRule): rule is ScheduledAlertRule {
  return rule.frequency_minutes !== undefined;
}

export function isAlertFrequency(value: unknown): value is AlertFrequency {
  return typeof value === "number" && (ALERT_FREQUENCY_MINUTES as readonly number[]).includes(value);
}

/** N: a whole number, at least 1. */
export function isAlertConsecutive(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * Widget types whose CURRENT value can be read from structured data.
 *
 * Deliberately short. A type earns a place here by having exactly one
 * unambiguous scalar in its own config — not by being important:
 *
 *  - `kpi_card`   — `config.value`, the number the card prints.
 *  - `goal_gauge` — `config.actual`, the measurement the ring fills toward
 *                   (`goal` is the target, not the reading).
 *
 * Everything else is refused, each for a stated reason:
 *
 *  - `section_header`, `note`, `live_status_bar` are STRUCTURAL: they carry no
 *    binding and no number at all.
 *  - `table`, `ranking`, `scatter_bubble`, `media_card`, `heatmap`,
 *    `distribution`, `status_list`, `funnel`, `funnel_modes`,
 *    `audience_summary` are multi-row or multi-point. There is no authoritative
 *    scalar, and inventing "the total" / "the top row" / "any row" would be
 *    this feature quietly deciding what the reader meant.
 *  - `line_chart`, `bar_chart`, `pie_chart` are series widgets, and "the latest
 *    point" is NOT unambiguous here. `SeriesPoint.x` is `string | number` with
 *    no declared ordering, `y` is nullable by contract (`null` means "in the
 *    window, not synced yet" and is explicitly not 0), and a multi-series chart
 *    identifies its series by `LineSeries.name` — a DISPLAY LABEL. Selecting a
 *    series for a canonical metric would mean matching on that label, which is
 *    exactly what a rule may never key on. Supporting them needs an ordering
 *    guarantee and a canonical series id; until the data contract offers both,
 *    refusing is the honest answer.
 */
export const ALERT_CAPABLE_WIDGETS: readonly WidgetType[] = ["kpi_card", "goal_gauge"];

/** Why a widget cannot be monitored, for copy that explains rather than hides. */
export type AlertIneligibility = "unsupported_widget" | "no_canonical_metric";

/**
 * The canonical metric identifiers this widget can be monitored on.
 *
 * Read from `config.metric` first and `binding.metric` second — both are
 * controlled-vocabulary identifiers, and both are what the producer stamped.
 * The rendered label is never consulted.
 *
 * Returns at most one for every currently supported type, which is the honest
 * answer rather than a limitation to work around: a KPI card states ONE
 * measure. (`windows[]` is that same metric at several observation ages, keyed
 * by labels like "D1" — ages, not metrics.) The function returns an array
 * anyway so the dialog's picker and this rule stay correct if a type with a
 * real canonical metric set is added later.
 */
export function alertMetricsForSlot(slot: WidgetSlot): string[] {
  if (!ALERT_CAPABLE_WIDGETS.includes(slot.widget)) return [];
  // The BINDING wins whenever there is one. `config` is the last ANSWER, and
  // after a rebind it still describes the previous measure until a fetch lands
  // (or fails, in which case it never does). Reading the metric from config
  // there would let the widget claim to be about Spend while its binding says
  // Impressions — and a rule keyed to that claim would fire on the old number.
  // config.metric is the fallback only for a slot that carries no binding.
  const fromBinding = bindingMetrics(slot.binding)[0];
  const fromConfig = slotConfig(slot).metric;
  const metric =
    (typeof fromBinding === "string" && fromBinding.trim()) ||
    (typeof fromConfig === "string" && fromConfig.trim()) ||
    "";
  return metric ? [metric] : [];
}

/** Whether this widget may carry a rule at all, and why not when it may not. */
export function alertEligibility(
  slot: WidgetSlot,
): { eligible: true } | { eligible: false; reason: AlertIneligibility } {
  if (!ALERT_CAPABLE_WIDGETS.includes(slot.widget)) {
    return { eligible: false, reason: "unsupported_widget" };
  }
  if (alertMetricsForSlot(slot).length === 0) {
    return { eligible: false, reason: "no_canonical_metric" };
  }
  return { eligible: true };
}

export function widgetSupportsAlertRule(slot: WidgetSlot): boolean {
  return alertEligibility(slot).eligible;
}

/**
 * The metrics a rule on this widget may watch (BUG-109-RD-L-02): the widget's
 * own first, then every metric the served vocabulary offers for the widget's
 * platform (`metricsForApp`). Empty for a widget that cannot be monitored.
 *
 * A widget on a DATASET (`dataset:<id>@<n>`, a recipe board's cell) is read
 * off that dataset, so it offers the dataset's metrics instead — the ones the
 * board's cells on it (`board`) bind; the vocabulary's platform list is not
 * the dataset's columns, and a metric it does not hold has no reading.
 *
 * Another metric is read on its own (`alertProbeSlot`) — never off this
 * widget's number — so offering it changes nothing on the widget itself.
 */
export function alertMetricChoices(slot: WidgetSlot, board: readonly WidgetSlot[] = []): string[] {
  if (!widgetSupportsAlertRule(slot)) return [];
  const own = alertMetricsForSlot(slot);
  const app = bindingSource(slot.binding);
  const dataset = datasetIdOf(app);
  if (dataset) {
    const bound = board
      .filter((cell) => datasetIdOf(bindingSource(cell.binding)) === dataset)
      .flatMap((cell) => bindingMetrics(cell.binding));
    return [...new Set([...own, ...bound])];
  }
  const served = app ? metricsForApp(app) : [];
  return [...new Set([...own, ...served])];
}

/** The dataset a `dataset:<id>@<n>` source names (any version), or null. */
export function datasetIdOf(source: string | undefined): string | null {
  const match = typeof source === "string" ? /^dataset:([^@\s]+)@\d+$/.exec(source) : null;
  return match ? match[1] : null;
}

/**
 * The widget's current monitored value, from STRUCTURED data only.
 *
 * Never from `value_label`, `diff_text`, a formatted currency string or
 * anything the DOM shows: those are localized, rounded and unit-suffixed, and
 * parsing them back would make "$18.4K" compare as 18.4. The number the rule
 * sees is the number the producer sent.
 *
 * `null` means "no value to compare", which is a real state — a card the
 * producer refused to put a figure on (`unavailable_reason`), a slot that has
 * not loaded, a windows-only card with no headline `value`. A rule never fires
 * on null; absence of evidence is not a breach.
 */
export function resolveAlertValue(slot: WidgetSlot, metric: string): number | null {
  if (!alertMetricsForSlot(slot).includes(metric)) return null;
  const config = slotConfig(slot);
  // The number and the name it was stamped with travel together. When config
  // says WHICH metric it measured and that is not the one being asked about,
  // the value belongs to the previous binding and must not be read at all —
  // this is the window between a metric change and the fetch that answers it.
  // Absent `config.metric` is not evidence of a mismatch (many stored cards
  // carry none), so it is allowed through exactly as before.
  const stamped = config.metric;
  if (typeof stamped === "string" && stamped.trim() && stamped !== metric) return null;
  switch (slot.widget) {
    case "kpi_card":
      return numberOrNull(config.value);
    case "goal_gauge":
      // `actual` is the reading; `goal` is the target it is measured against.
      return numberOrNull(config.actual);
    default:
      return null;
  }
}

/** Whether a value off the wire is an operator this build accepts. */
export function isAlertOperator(value: unknown): value is AlertOperator {
  return typeof value === "string" && (ALERT_OPERATORS as readonly string[]).includes(value);
}

/**
 * A rule as stored, or null.
 *
 * Validated on READ as well as on write: a board can be edited by another
 * client, hand-written, or stored before a field existed, and a malformed rule
 * must read as "no rule" rather than throw inside a render.
 */
export function readAlertRule(slot: WidgetSlot): WidgetAlertRule | null {
  const raw = slotConfig(slot).alert_rule;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const threshold = numberOrNull(candidate.threshold);
  if (threshold === null) return null;
  if (!isAlertOperator(candidate.operator)) return null;
  if (typeof candidate.metric !== "string" || !candidate.metric) return null;
  if (typeof candidate.enabled !== "boolean") return null;
  const rule: WidgetAlertRule = {
    enabled: candidate.enabled,
    metric: candidate.metric,
    operator: candidate.operator,
    threshold,
  };
  // A rule saved before the schedule existed carries neither field and reads
  // exactly as before. One that carries either must carry both, well formed:
  // a cadence the board cannot run is no rule, never a guessed default.
  if (candidate.frequency_minutes === undefined && candidate.consecutive === undefined) return rule;
  if (!isAlertFrequency(candidate.frequency_minutes)) return null;
  if (!isAlertConsecutive(candidate.consecutive)) return null;
  const scheduled = { ...rule, frequency_minutes: candidate.frequency_minutes, consecutive: candidate.consecutive };
  // A malformed Lark or email part sends nothing; the rule itself still shows.
  const lark = readAlertLark(candidate.lark);
  const email = readAlertEmail(candidate.email);
  // Read as stored, or not at all: a kind that is not one is never read as either.
  const link = isAlertLinkKind(candidate.link) ? candidate.link : undefined;
  return { ...scheduled, ...(lark ? { lark } : {}), ...(email ? { email } : {}), ...(link ? { link } : {}) };
}

function readAlertEmail(raw: unknown): AlertEmailDelivery | null {
  if (!raw || typeof raw !== "object") return null;
  const { enabled, recipients } = raw as Record<string, unknown>;
  if (typeof enabled !== "boolean" || !Array.isArray(recipients)) return null;
  if (!recipients.every((entry) => typeof entry === "string")) return null;
  return { enabled, recipients: recipients as string[] };
}

function readAlertLark(raw: unknown): AlertLarkDelivery | null {
  if (!raw || typeof raw !== "object") return null;
  const { enabled, channel_id: channelId } = raw as Record<string, unknown>;
  if (typeof enabled !== "boolean" || typeof channelId !== "string") return null;
  if (enabled && !channelId.trim()) return null;
  return { enabled, channel_id: channelId };
}

/** Whether a rule sends its breach to a Lark channel. */
export function sendsToLark(rule: WidgetAlertRule): rule is ScheduledAlertRule & { lark: AlertLarkDelivery } {
  return isScheduledAlertRule(rule) && rule.lark?.enabled === true && rule.lark.channel_id.trim() !== "";
}

/** Whether a rule emails its breach: on, with at least one recipient. */
export function sendsEmail(rule: WidgetAlertRule): rule is ScheduledAlertRule & { email: AlertEmailDelivery } {
  return isScheduledAlertRule(rule) && rule.email?.enabled === true && rule.email.recipients.length > 0;
}

/** Whether an email setting may be saved: off, or 1 to the limit of plain addresses. */
function isValidAlertEmail(email: AlertEmailDelivery | undefined): boolean {
  if (!email?.enabled) return true;
  const { recipients } = email;
  return recipients.length >= 1 && recipients.length <= MAX_ALERT_EMAIL_RECIPIENTS &&
    new Set(recipients).size === recipients.length &&
    recipients.every((address) => normalizeAlertEmail(address) === address);
}

/**
 * Whether `threshold` is inside `metric`'s value domain — false only for a
 * negative threshold on a metric the source states cannot be negative (its
 * describe `min` is 0 or more; BUG-101-RD-L-09). A threshold below 0 on one of
 * those can never be crossed from below and is always crossed from above, so
 * "≥ −100" is always true and "≤ −100" never is.
 *
 * The domain is the SOURCE's to state: this holds no list of metric keys. A
 * metric that states no `min` (and any metric before the vocabulary has
 * loaded) keeps accepting any finite threshold, negatives included — a delta, a
 * growth rate or a net figure is legitimately negative, and refusing a real
 * value would be worse than accepting a silly one.
 */
export function isAlertThresholdInDomain(metric: string, threshold: number): boolean {
  return !(threshold < 0 && metricIsNonNegative(metric));
}

/**
 * Whether a rule may be SAVED against this widget.
 *
 * Stricter than `readAlertRule`: a rule is only valid for a widget whose metric
 * set contains it, so the dialog cannot store a rule about a measure the widget
 * does not carry. Both are needed — this one refuses bad input, the reader
 * above tolerates bad storage.
 */
export function isValidAlertRuleFor(slot: WidgetSlot, rule: WidgetAlertRule, board: readonly WidgetSlot[] = []): boolean {
  if (!widgetSupportsAlertRule(slot)) return false;
  if (!Number.isFinite(rule.threshold)) return false;
  // Write side only: `readAlertRule` still reads a negative rule saved before
  // this existed, so a stored rule is never rewritten or dropped behind the
  // owner's back — it just cannot be saved again until the number is fixed.
  if (!isAlertThresholdInDomain(rule.metric, rule.threshold)) return false;
  if (!isAlertOperator(rule.operator)) return false;
  if (typeof rule.enabled !== "boolean") return false;
  // A rule without a schedule is judged off the widget's own number, so it
  // may only name the widget's own metric — as before.
  // Nor be sent to Lark or by email: only checks on a schedule send.
  if (!isScheduledAlertRule(rule)) {
    return !rule.lark?.enabled && !rule.email?.enabled && rule.link === undefined &&
      alertMetricsForSlot(slot).includes(rule.metric);
  }
  if (rule.link !== undefined && !isAlertLinkKind(rule.link)) return false;
  if (!isAlertFrequency(rule.frequency_minutes) || !isAlertConsecutive(rule.consecutive)) return false;
  // Lark on needs a channel; only a scheduled rule (this branch) may carry it.
  if (rule.lark?.enabled && !rule.lark.channel_id.trim()) return false;
  if (!isValidAlertEmail(rule.email)) return false;
  return alertMetricChoices(slot, board).includes(rule.metric);
}

/**
 * The id a probe is SENT under — never the widget's own, never stored.
 *
 * The widget-data endpoint takes a `slot_id` of `^[A-Za-z0-9_-]+$`, at most
 * 100 characters (CLUEGA_AI_CDP `WidgetDataRequest`); `${id}::alert` broke
 * both, every check came back 422 and a saved rule never showed
 * (BUG-109-RD-L-02). So: the widget's id + `_alert` when that fits the shape;
 * otherwise (an id at the limit, or one carrying other characters) its first
 * characters, made safe, + an FNV-1a hash of the WHOLE id + `_alert` — ids
 * that differ only past the cut still differ. Answers are matched to probes by
 * position, so the id only has to be accepted and distinct within its batch
 * (`AlertCheckScheduler` guarantees the latter).
 */
const PROBE_ID_SHAPE = /^[A-Za-z0-9_-]+$/;
const PROBE_ID_MAX = 100;
const PROBE_ID_SUFFIX = "_alert";

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function alertProbeId(slotId: string): string {
  const plain = `${slotId}${PROBE_ID_SUFFIX}`;
  if (plain.length <= PROBE_ID_MAX && PROBE_ID_SHAPE.test(plain)) return plain;
  const tail = `-${fnv1a(slotId)}${PROBE_ID_SUFFIX}`;
  return `${slotId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, PROBE_ID_MAX - tail.length)}${tail}`;
}

/**
 * The read a scheduled check makes for `rule` on this widget — a slot handed
 * to the widget-data endpoint, never committed to the board.
 *
 * The widget's OWN metric is read through the widget itself (same type,
 * binding and target), so a gauge is checked on its measurement over its
 * target period and a KPI card on its headline.
 *
 * ANOTHER metric is read as a KPI of that metric over the widget's EFFECTIVE
 * scope (BUG-109-RD-L-02 review):
 *  - the period it actually measured — `config.period`, the dates the
 *    producer stamped on the cell (RD-T-07) — so a gauge measuring its
 *    target's 01/10–06/10 is not read over the board's 07/09–06/10, and a
 *    widened card over the window it showed; the binding's own range only
 *    when the cell states no period;
 *  - every filter that shapes its rows: objective, delivery, and a drilled
 *    campaign / ad group — never the whole account in their place;
 *  - and nothing else: no prior period (`compare: "none"`), no display config.
 * The widget's binding and content are untouched either way.
 */
export function alertProbeSlot(slot: WidgetSlot, rule: WidgetAlertRule): WidgetSlot {
  const id = alertProbeId(slot.slot_id);
  if (alertMetricsForSlot(slot).includes(rule.metric)) {
    return { ...slot, slot_id: id, state: "empty", data: undefined };
  }
  const b = slot.binding;
  const period = readPeriod(slot.config);
  const binding: NonNullable<WidgetSlot["binding"]> = period
    ? { app: b?.app ?? "", metric: rule.metric, range: "custom", range_start: period.start, range_end: period.end }
    : { app: b?.app ?? "", metric: rule.metric, range: b?.range ?? "" };
  if (!period && b?.range_start !== undefined) binding.range_start = b.range_start;
  if (!period && b?.range_end !== undefined) binding.range_end = b.range_end;
  binding.compare = "none";
  if (b?.objective !== undefined) binding.objective = b.objective;
  if (b?.delivery !== undefined) binding.delivery = b.delivery;
  if (b?.campaign_id !== undefined) binding.campaign_id = b.campaign_id;
  if (b?.adgroup_id !== undefined) binding.adgroup_id = b.adgroup_id;
  return {
    slot_id: id,
    widget: "kpi_card",
    layout: slot.layout,
    binding,
    state: "empty",
    config: {},
  } as WidgetSlot;
}

/**
 * What a check read: the metric's number and the snapshot it came from
 * (`synced_at`), or null when the answer carries no reading — a refused or
 * empty cell, or an answer about another metric. A measured 0 IS a reading.
 */
export function readProbeValue(returned: WidgetSlot, metric: string): { value: number; snapshot: string | null } | null {
  if (!EVALUABLE_STATES.has(returned.state)) return null;
  const value = resolveAlertValue(returned, metric);
  if (value === null) return null;
  const synced = (returned as { synced_at?: unknown }).synced_at;
  return { value, snapshot: typeof synced === "string" && synced ? synced : null };
}

/**
 * The slot with its rule set, or removed when `rule` is null.
 *
 * Removal DELETES the key rather than storing `{enabled:false}` or `undefined`:
 * a board with no rule must serialize exactly as it did before this feature
 * existed, and `JSON.stringify` keeps a key whose value is null.
 */
export function withAlertRule(slot: WidgetSlot, rule: WidgetAlertRule | null): WidgetSlot {
  const config = { ...slotConfig(slot) };
  if (rule) config.alert_rule = rule;
  else delete config.alert_rule;
  // A slot that never had a rule and is handed none keeps its config identity,
  // so "remove a rule that is not there" cannot dirty the board.
  if (!rule && !("alert_rule" in slotConfig(slot))) return slot;
  return { ...slot, config };
}

/**
 * The states in which a widget is showing a number.
 *
 * Mirrors `hasRenderedData` in refreshMerge — same two states, same reason —
 * but named here so this module does not depend on the refresh path to decide
 * whether a card has anything on screen.
 */
const EVALUABLE_STATES = new Set<WidgetSlot["state"]>(["ok", "ok_stale"]);

/** A breach, derived. Carries what the message needs and nothing persisted. */
export interface AlertBreach {
  metric: string;
  value: number;
  operator: AlertOperator;
  threshold: number;
}

/**
 * The breach this slot is currently in, or null — derived, never stored.
 *
 * Every guard that returns null is a case where evaluating would assert
 * something untrue:
 *  - no rule, or the reader disabled it;
 *  - the widget cannot be monitored (a type change can leave a rule behind);
 *  - the rule names a metric this widget no longer carries — the stale-binding
 *    case. `applyWidgetConfig` clears the rule when a rebind invalidates it,
 *    and this refuses to evaluate one that survives by any other path;
 *  - there is no finite value on screen yet.
 *
 * Because it is derived from the slot, the SAME call answers correctly on a
 * board opened from its stored snapshot, after a manual Refresh commits new
 * data, and the moment the rule itself changes — with no extra request and no
 * dependence on what `runBoardRefresh` reported. A refresh that says
 * "unchanged" still re-derives from whatever the slot now holds.
 */
export function evaluateAlertRule(slot: WidgetSlot): AlertBreach | null {
  const rule = readAlertRule(slot);
  if (!rule || !rule.enabled) return null;
  // A scheduled rule is judged by its CHECKS (`alertChecks`), never at render:
  // a render is not a check, and firing here would skip its N.
  if (isScheduledAlertRule(rule)) return null;
  if (!widgetSupportsAlertRule(slot)) return null;
  // Only against numbers the reader can SEE. `config.value` outlives the state
  // that produced it — a rebind, a range change or a failed fetch leaves the
  // previous figure sitting in config while the card shows a spinner, an empty
  // box or an error. Alerting from that is alerting about a number nobody is
  // looking at, and it is wrong as often as it is stale.
  //
  // `ok_stale` DOES alert: that card is displaying its last good reading, the
  // measurement did not stop being true, and the badge already says it is not
  // current. The rule itself is never removed for a temporary gap — it simply
  // does not fire until there are numbers again.
  if (!EVALUABLE_STATES.has(slot.state)) return null;
  if (!alertMetricsForSlot(slot).includes(rule.metric)) return null;
  const value = resolveAlertValue(slot, rule.metric);
  if (value === null) return null;
  if (!compareAlertValue(value, rule.operator, rule.threshold)) return null;
  return { metric: rule.metric, value, operator: rule.operator, threshold: rule.threshold };
}
