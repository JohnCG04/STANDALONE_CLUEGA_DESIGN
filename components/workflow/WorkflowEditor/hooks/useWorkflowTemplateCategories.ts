import { useEffect, useState } from "react";

import type { WorkflowTemplateCategory } from "@dogclaw-ad/workflow";

import { useTranslate } from "@/hooks/useTranslate";
import { loadFlowPresetCategories } from "@/resources/app/pages/app/components/Flow/hooks/useFlowPresets";
import { FALLBACK_TEMPLATE_CATEGORIES } from "../constants";
import { toTemplateCategory } from "../helpers";

/**
 * Save Template's Category rows from `GET /flow-presets/categories`; `enabled: false` skips it.
 * The array identity changes once, when the live rows land, as `templateCategories` asks.
 */
export function useWorkflowTemplateCategories(
  enabled: boolean,
): WorkflowTemplateCategory[] {
  const { lang } = useTranslate();
  const [categories, setCategories] = useState<WorkflowTemplateCategory[]>(
    FALLBACK_TEMPLATE_CATEGORIES,
  );

  // `lang` relabels the picker on a language switch; the fetch is session-cached, so no request.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadFlowPresetCategories()
      .then((rows) => {
        if (active && rows.length > 0) {
          setCategories(rows.map((row) => toTemplateCategory(row, lang)));
        }
      })
      // The fallback list is already in place; a failed fetch must not break the dialog.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, lang]);

  return categories;
}
