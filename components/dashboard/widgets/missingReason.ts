/**
 * Why a cell has no number, in the reader's language.
 *
 * The data source states the reason per metric (ds/1 `missing: {metric: reason}`)
 * and the AI producer sends it on the slot as `config.unavailable_cause` (or the
 * whole `config.missing` map). The producer's own sentence (`unavailable_reason`)
 * is the fallback for a cause this build has no words for.
 *
 * The codes are the wire contract's, not metric knowledge: the words say what
 * kind of absence it is, never which metric or platform.
 */
import type { LanguageCode } from "@/i18n/config";
import { translateStatic } from "@/i18n/dictionaries";
import { toBackendLocale } from "@/lib/ai-agent/cluega-session-auth";
import { metricMeta } from "@/lib/dashboard/vocabulary";
import { bindingMetrics, type WidgetBinding } from "./types";

const KNOWN_CAUSES = ["not_reported", "not_additive", "not_tracked", "undefined", "not_connected"];

/** The reason code a slot carries for its lead metric, or undefined. */
export function slotMissingCause(
  config: unknown,
  binding: WidgetBinding | null | undefined,
): string | undefined {
  const c = (config ?? {}) as { unavailable_cause?: unknown; missing?: unknown };
  if (typeof c.unavailable_cause === "string" && c.unavailable_cause) return c.unavailable_cause;
  if (c.missing && typeof c.missing === "object") {
    const map = c.missing as Record<string, unknown>;
    for (const metric of bindingMetrics(binding)) {
      if (typeof map[metric] === "string") return map[metric] as string;
    }
  }
  return undefined;
}

/** The localized sentence for a reason code, or undefined when this build has none. */
export function missingCauseText(cause: string | undefined, lang: LanguageCode): string | undefined {
  if (!cause || !KNOWN_CAUSES.includes(cause)) return undefined;
  return translateStatic(`dashboard.state.missing.${cause}`, lang);
}

/** What the shell needs to say why a value is missing. */
export interface EmptyWhy {
  /** The source's reason code for the lead metric. */
  cause?: string;
  /** A note the producer sent for the metric (describe `note`). */
  note?: string;
  /** The metrics the slot reads, for a vocabulary note when the producer sent none. */
  metrics: string[];
}

export function slotEmptyWhy(config: unknown, binding: WidgetBinding | null | undefined): EmptyWhy | undefined {
  const sent = (config as { unavailable_note?: unknown } | null | undefined)?.unavailable_note;
  const why: EmptyWhy = {
    cause: slotMissingCause(config, binding),
    note: typeof sent === "string" && sent.trim() ? sent : undefined,
    metrics: bindingMetrics(binding),
  };
  return why.cause || why.note || why.metrics.length ? why : undefined;
}

/** A note as one non-empty line in `lang`: a plain string, or a {vi,en,zh} object (English as the fallback). Empty or any other shape gives "". */
export function noteText(note: unknown, lang: LanguageCode): string {
  if (typeof note === "string") return note.trim();
  if (note && typeof note === "object") {
    const byLocale = note as Record<string, unknown>;
    const text = byLocale[toBackendLocale(lang)] || byLocale.en;
    if (typeof text === "string") return text.trim();
  }
  return "";
}

/** The describe `note` for the first of the slot's metrics that has one, in `lang`. */
export function emptyNoteText(why: EmptyWhy | undefined, lang: LanguageCode): string | undefined {
  if (!why) return undefined;
  if (why.note) return why.note;
  for (const metric of why.metrics) {
    const text = noteText(metricMeta(metric)?.note, lang);
    if (text) return text;
  }
  return undefined;
}
