"use client";

import { useMemo } from "react";
import {
  AgentLanding,
  type AgentDraft,
  type WorkflowAgentActions,
} from "@dogclaw-ad/workflow-agent";

import { LearnButton } from "@/components/learn";
import { workflowAgentActions } from "@/components/workflow/agent/agentActions";
import { EDITOR_LOCALE_BY_LANGUAGE } from "@/components/workflow/WorkflowEditor/constants";
import { useEditorTheme } from "@/components/workflow/WorkflowEditor/hooks/useEditorTheme";
import { useTranslate } from "@/hooks/useTranslate";
import { flowAgentSuggestions } from "@/lib/flow/flowAgentSuggestions";
import { FlowPageShell } from "../../components/FlowPageShell";
import { FlowHomeHero } from "../components/FlowHomeHero";
import { HomeRecentProjects } from "../components/HomeRecentProjects";

/**
 * Composition root for /flow. All Home UI stays inside the Flow feature.
 *
 * Top to bottom: the hero band — the page actions sit on the art, the agent
 * launcher below it (no heading: the launcher carries its own) — then the four
 * most recent projects.
 */
export const FlowHome = ({
  onCreate,
  onOpenProject,
  onSeeAllProjects,
  onStartWithAgent,
}: {
  onCreate: () => void;
  onOpenProject: (id: string) => void;
  onSeeAllProjects: () => void;
  /**
   * Mint a project for the launcher's prompt and open the editor on it. Rejects
   * on failure, which is how `AgentLanding` knows to keep the typed prompt and
   * show its own error line instead of leaving the user on a dead composer.
   */
  onStartWithAgent: (draft: AgentDraft) => Promise<void>;
}) => {
  const { t, lang } = useTranslate();
  // The agent surfaces take an explicit theme and a package locale, the same two
  // the canvas needs — so they read them from the same place it does.
  const theme = useEditorTheme();

  /*
   * The launcher's chips, on top of the shared adapter.
   *
   * They live here rather than in `agent-actions.ts` because the copy is
   * translated, and that module is plain data with no hook to read the current
   * language from. Shuffle simply calls this again, and each call deals a
   * different three.
   */
  const agentActions = useMemo<WorkflowAgentActions>(
    () => ({
      ...workflowAgentActions,
      listSuggestions: async () => flowAgentSuggestions(t),
    }),
    [t],
  );

  return (
    <FlowPageShell>
      {/*
        The OUTSIDE surface: a launcher, not a chat. It renders no reply — on
        submit the host creates the project and navigates, and the drawer inside
        the editor picks the prompt up as its seed. The class overrides drop the
        package's full-height centering so it sits as a band on this page,
        under the canvas still and sweeping circle FlowHomeHero paints above it.
      */}
      <FlowHomeHero
        actions={
          <>
            <LearnButton guideId="flow-home" className="rounded-full" />
            <button
              type="button"
              onClick={onCreate}
              data-learn="flow-home.create-new"
              className="inline-flex h-9 items-center justify-center rounded-xl bg-neutral-900 px-4 text-[13px] font-bold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950"
            >
              {t("appChat.flow.createNew")}
            </button>
          </>
        }
      >
        <div data-learn="flow-home.agent-launcher">
          <AgentLanding
            actions={agentActions}
            theme={theme}
            locale={EDITOR_LOCALE_BY_LANGUAGE[lang]}
            // Same call as the drawer's: the library's palette, so the launcher
            // and the thread it hands over to are one surface.
            palette="own"
            onStart={onStartWithAgent}
            // `!`: the package paints .cwa-root unlayered (#16161c in dark); the band wears the page's.
            className="min-h-0 bg-transparent! px-0 py-0"
          />
        </div>
      </FlowHomeHero>

      <HomeRecentProjects
        onCreate={onCreate}
        onOpenProject={onOpenProject}
        onSeeAll={onSeeAllProjects}
      />
    </FlowPageShell>
  );
};
