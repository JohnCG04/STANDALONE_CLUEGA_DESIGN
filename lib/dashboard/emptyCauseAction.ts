/**
 * Which field of a widget's own edit form may answer why it is empty
 * (BUG-119.1-RD-R-08), decided from the producer's reason CODE — never from the
 * translated sentence beside it.
 *
 * - `not_reported`: the source sent rows without the metric. Another period MAY
 *   bring it, so the form opens on the period — with a note that it may not.
 * - `not_supported` / `not_additive` / `undefined`: the metric cannot be read or
 *   computed here at all, and no period fixes that, so the form opens on the
 *   metric.
 *
 * `empty_window` is the expand button's (`expandRange`); errors, quota and
 * re-authorisation keep their own actions; any other code offers nothing.
 */
import { isSourceBinding, type WidgetSlot } from "@/components/dashboard/widgets/types";
import { slotMissingCause } from "@/components/dashboard/widgets/missingReason";
import { slotConfig } from "@/lib/dashboard/slotConfig";
import { metricsForApp, rangesForSource } from "@/lib/dashboard/vocabulary";

export type EmptyEditField = "range" | "metric";

const RANGE_CAUSES: ReadonlySet<string> = new Set(["not_reported"]);
const METRIC_CAUSES: ReadonlySet<string> = new Set(["not_supported", "not_additive", "undefined"]);

/** A platform that reads only "current" has no period to pick (the form hides the field). */
function rangeFixed(app: string, range: string | undefined): boolean {
  if (range === "current") return true;
  const served = rangesForSource(app);
  return served !== null && served.length === 1 && served[0] === "current";
}

/** The field the empty widget's form should open on, or null when none is offered. */
export function emptyEditField(slot: WidgetSlot): EmptyEditField | null {
  if (slot.state !== "empty") return null;
  const binding = slot.binding;
  // Only the `{app, metric, range}` binding the form edits; a source read is changed by chat.
  if (!binding || isSourceBinding(binding) || !binding.app || !binding.metric) return null;
  const config = slotConfig(slot);
  const cause = slotMissingCause(config, binding);
  if (!cause) return null;
  if (RANGE_CAUSES.has(cause)) {
    // A gauge read over its target's own period does not read the widget's range.
    if (typeof config.goal_period === "string" && config.goal_period) return null;
    return rangeFixed(binding.app, binding.range) ? null : "range";
  }
  if (METRIC_CAUSES.has(cause)) {
    // Unknown until the vocabulary loads: offered, and the form loads it.
    const offered = metricsForApp(binding.app);
    return offered.length === 0 || offered.some((m) => m !== binding.metric) ? "metric" : null;
  }
  return null;
}
