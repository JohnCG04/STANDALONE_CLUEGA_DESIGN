"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, SearchX } from "lucide-react";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTranslate } from "@/hooks/useTranslate";
import { FLOW_BRAND_KIT_ROUTE } from "@/lib/flow/flowBrandKitRoute";

import { FlowEmptyState } from "../../components/FlowEmptyState";
import { FlowPageShell } from "../../components/FlowPageShell";
import { BrandKitEditorHeader } from "../components/BrandKitEditorHeader";
import { BrandKitGridSkeleton } from "../components/BrandKitGridSkeleton";
import { BrandSectionNav } from "../components/BrandSectionNav";
import { BrandSectionPanel } from "../components/BrandSectionPanel";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { ColorsSection } from "../components/sections/ColorsSection";
import { ComplianceSection } from "../components/sections/ComplianceSection";
import { LogoSection } from "../components/sections/LogoSection";
import { MissionSection } from "../components/sections/MissionSection";
import { PhotographySection } from "../components/sections/PhotographySection";
import { RulesSection } from "../components/sections/RulesSection";
import { SpacingSection } from "../components/sections/SpacingSection";
import { ToneSection } from "../components/sections/ToneSection";
import { TypographySection } from "../components/sections/TypographySection";
import {
  BRAND_SECTIONS,
  EDITOR_LAYOUT_CLASS,
  SECTION_DESCRIPTION_KEY,
  SECTION_LABEL_KEY,
} from "../constants";
import { useBrandKitDraft } from "../hooks/useBrandKitDraft";
import { useBrandKitSave } from "../hooks/useBrandKitSave";
import { useBrandKitSections } from "../hooks/useBrandKitSections";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import type { BrandSectionId } from "../types";

/**
 * The nine-section editor, for a saved brand or a draft that has none yet.
 *
 * `brandId === null` is the pre-save state, seeded from `?template=` when there
 * is one. Save then imports, and the url is rewritten in place — see
 * useBrandKitSave for why that is `history.replaceState` and not a navigation.
 *
 * Every field is editable on a saved brand. It was not always: `PATCH` never
 * wrote `source_kit`, so a colour's name edited here reverted on reload and the
 * editor disabled it rather than lie. `PUT` replaces the document.
 */
export const BrandKitEditor = ({ brandId }: { brandId: string | null }) => {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const templateId = searchParams?.get("template") ?? undefined;

  const {
    state,
    draft,
    isDirty,
    dirty,
    invalidSections,
    patch,
    setName,
    commit,
    markInvalid,
  } = useBrandKitDraft(brandId, templateId);

  const sections = useBrandKitSections(draft, dirty, invalidSections);
  const [active, setActive] = useState<BrandSectionId>("mission");
  const guard = useUnsavedChangesGuard(isDirty);
  const { save, isSaving, error } = useBrandKitSave({
    onSaved: commit,
    onInvalid: (next) => {
      markInvalid(next);
      // Put the user on the first refused section rather than leaving a red dot
      // somewhere off screen.
      if (next.length > 0) setActive(next[0]);
    },
  });


  if (state.status === "loading") {
    return (
      <FlowPageShell>
        <BrandKitGridSkeleton />
      </FlowPageShell>
    );
  }

  if (state.status === "missing") {
    return (
      <FlowPageShell>
        <FlowEmptyState
          icon={SearchX}
          title={t("appChat.brandKit.editor.missingTitle")}
          description={t("appChat.brandKit.editor.missingDescription")}
          actionLabel={t("appChat.brandKit.editor.missingAction")}
          onAction={() => guard.requestLeave(FLOW_BRAND_KIT_ROUTE)}
        />
      </FlowPageShell>
    );
  }

  if (state.status === "error") {
    return (
      <FlowPageShell>
        <FlowEmptyState
          icon={SearchX}
          title={t("appChat.brandKit.loadFailed")}
          description={t("appChat.brandKit.error.generic")}
          actionLabel={t("appChat.brandKit.retry")}
          onAction={state.retry}
        />
      </FlowPageShell>
    );
  }

  const body: Record<BrandSectionId, React.ReactNode> = {
    mission: (
      <MissionSection
        mission={draft.mission}
        onChange={(next) => patch("mission", next)}
      />
    ),
    colors: (
      <ColorsSection
        colors={draft.colors}
        onChange={(next) => patch("colors", next)}
      />
    ),
    typography: (
      <TypographySection
        textStyles={draft.textStyles}
        onChange={(next) => patch("textStyles", next)}
      />
    ),
    logo: (
      <LogoSection
        logos={draft.logos}
        unreadableLogos={draft.unreadableLogos}
        onChange={(next) => patch("logos", next)}
      />
    ),
    photography: (
      <PhotographySection
        photography={draft.photography}
        onChange={(next) => patch("photography", next)}
      />
    ),
    tone: (
      <ToneSection
        tone={draft.tone}
        onChange={(next) => patch("tone", next)}
      />
    ),
    layout: (
      <SpacingSection layout={draft.layout} onChange={(next) => patch("layout", next)} />
    ),
    rules: (
      <RulesSection rules={draft.rules} onChange={(next) => patch("rules", next)} />
    ),
    compliance: (
      <ComplianceSection
        disclaimers={draft.disclaimers}
        onChange={(next) => patch("disclaimers", next)}
      />
    ),
  };

  return (
    <FlowPageShell>
      <BrandKitEditorHeader
        name={draft.name}
        isDirty={isDirty}
        isSaving={isSaving}
        onNameChange={setName}
        onBack={() => guard.requestLeave(FLOW_BRAND_KIT_ROUTE)}
        onSave={() => void save(draft)}
      />

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-[13px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Tabs
        orientation="vertical"
        value={active}
        onValueChange={(value) => setActive(value as BrandSectionId)}
        className={EDITOR_LAYOUT_CLASS}
      >
        <BrandSectionNav sections={sections} />
        <div className="min-w-0">
          {BRAND_SECTIONS.map((id) => (
            <TabsContent key={id} value={id} className="mt-0">
              <BrandSectionPanel
                titleKey={SECTION_LABEL_KEY[id]}
                descriptionKey={SECTION_DESCRIPTION_KEY[id]}
              >
                {body[id]}
              </BrandSectionPanel>
            </TabsContent>
          ))}
        </div>
      </Tabs>

      <UnsavedChangesDialog
        open={guard.confirmOpen}
        onStay={guard.cancelLeave}
        onDiscard={guard.confirmLeave}
      />
    </FlowPageShell>
  );
};
