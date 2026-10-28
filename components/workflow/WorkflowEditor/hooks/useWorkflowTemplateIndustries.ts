import { useEffect, useState } from "react";

import type { WorkflowTemplateIndustry } from "@dogclaw-ad/workflow";

import { useTranslate } from "@/hooks/useTranslate";
import { loadFlowIndustries } from "@/resources/app/pages/app/components/Flow/services/flow-industries.service";
import { EMPTY_INDUSTRIES } from "../constants";
import { toTemplateIndustry } from "../helpers";

/**
 * Save Template's Industry rows from `GET /flow-presets/industries`; no fallback, since an
 * invented slug fails the save. The identity changes once, as `templateIndustries` asks.
 */
export function useWorkflowTemplateIndustries(
  enabled: boolean,
): WorkflowTemplateIndustry[] {
  const { lang } = useTranslate();
  const [industries, setIndustries] = useState<WorkflowTemplateIndustry[]>(
    EMPTY_INDUSTRIES,
  );

  // `lang` relabels the picker on a language switch; the fetch is session-cached, so no request.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadFlowIndustries()
      .then((rows) => {
        if (active && rows.length > 0) {
          setIndustries(rows.map((row) => toTemplateIndustry(row, lang)));
        }
      })
      // "No such endpoint" is already an empty list; a real failure must not break the dialog.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, lang]);

  return industries;
}
