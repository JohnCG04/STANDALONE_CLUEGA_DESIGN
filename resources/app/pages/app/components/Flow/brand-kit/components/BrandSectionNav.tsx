"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import {
  SECTION_DOT_CLASS,
  SECTION_LABEL_KEY,
  SECTION_NAV_LIST_CLASS,
  SECTION_NAV_TRIGGER_CLASS,
  SECTION_STATUS_LABEL_KEY,
} from "../constants";
import type { BrandSectionStatus } from "../types";

/**
 * The editor's left rail: nine rows, each a coloured status dot and a label.
 *
 * A vertical Radix Tabs list rather than hand-rolled buttons — `role="tablist"`,
 * `aria-selected`, `aria-controls` and Up/Down + Home/End roving focus come
 * free; only the geometry is ours.
 *
 * Vertical on purpose: nine labels in a row cannot fit a phone without a
 * sideways scroller, and the rail already reflows above the panel below `lg`.
 *
 * The dot is `aria-hidden` and paired with an sr-only status word — colour is
 * never the only carrier: "Partly filled" has to be audible, not just amber.
 */
export const BrandSectionNav = ({
  sections,
}: {
  sections: readonly BrandSectionStatus[];
}) => {
  const { t } = useTranslate();
  return (
    <TabsList
      aria-label={t("appChat.brandKit.editor.sectionNav")}
      className={SECTION_NAV_LIST_CLASS}
    >
      {sections.map((section) => (
        <TabsTrigger
          key={section.id}
          value={section.id}
          className={SECTION_NAV_TRIGGER_CLASS}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1 size-2 rounded-full border",
              SECTION_DOT_CLASS[section.completeness],
            )}
          />
          <span className="min-w-0 truncate">
            {t(SECTION_LABEL_KEY[section.id])}
            <span className="sr-only">
              {", "}
              {t(SECTION_STATUS_LABEL_KEY[section.completeness])}
              {section.dirty ? `, ${t("appChat.brandKit.editor.unsaved")}` : ""}
            </span>
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
};
