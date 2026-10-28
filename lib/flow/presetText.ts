/**
 * The one place a preset's authored copy is resolved for display.
 *
 * A preset's `name` and `description` are written per locale by the editor's
 * publish wizards and travel as a whole object, so the reader's language is a
 * RENDER-time decision rather than a request parameter: no `?locale=` on the
 * fetch, no cache key per language, and switching the app's language re-renders
 * without refetching anything.
 *
 * Pure and free of React, so `node --test` covers the fallback rules without
 * mounting a tree; the hook below is the thin binding for components.
 */

import { useTranslate } from "@/hooks/useTranslate";
import type { LanguageCode } from "@/i18n/config";
import type { PresetLocalizedText } from "@/resources/app/pages/app/components/Flow/services/flow-presets.service";

/**
 * The app's language codes and the editor's locale keys disagree about
 * Vietnamese — the app says `vn`, the editor (and the wire) say `vi`. This is
 * the ONE mapping; `WorkflowEditorClient` and `PublicWorkflowViewer` read it
 * rather than keeping copies that can drift.
 */
export const EDITOR_LOCALE_BY_LANGUAGE: Record<
  LanguageCode,
  keyof PresetLocalizedText
> = {
  en: "en",
  vn: "vi",
  zh: "zh",
  // Presets are authored in en/vi/zh only; Thai readers get the English copy.
  th: "en",
};

/**
 * The text to show for `value` in `lang`: the requested locale, then English,
 * then any locale that was actually written. `""` when nothing was — a caller
 * treats that as "no description" rather than rendering an empty element.
 *
 * A bare string is tolerated because rows written before copy went multilingual
 * still arrive that way from any client that skipped `normalizePreset`.
 */
export function presetText(
  value: PresetLocalizedText | string | undefined | null,
  lang: LanguageCode,
): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();

  const order: (keyof PresetLocalizedText)[] = [
    EDITOR_LOCALE_BY_LANGUAGE[lang] ?? "en",
    "en",
    "vi",
    "zh",
  ];
  for (const locale of order) {
    const text = value[locale]?.trim();
    if (text) return text;
  }
  return "";
}

/**
 * `presetText` bound to the language the user is reading. Returned as a
 * function rather than a resolved string so one component can localize several
 * fields (a name and a description) from a single hook call.
 */
export function usePresetText(): (
  value: PresetLocalizedText | string | undefined | null,
) => string {
  const { lang } = useTranslate();
  return (value) => presetText(value, lang);
}
