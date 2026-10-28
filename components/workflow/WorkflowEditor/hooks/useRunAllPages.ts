import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { listPages } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { useToastStore } from "@/lib/stores/useToastStore";
import { useTranslate } from "@/hooks/useTranslate";
import type { RunGraphResult } from "../../executor/types";
import { SESSION_POLL_MS, SESSION_READY_TIMEOUT_MS } from "../constants";
import { runAllRows, runSummary, sumRuns, wait } from "../helpers";
import type { PageSessionHandle, RunAllPageRow, RunAllProgress } from "../types";

/** The page's handle once it has mounted; `undefined` after a stop or a mount that never came. */
async function waitForSession(
  sessions: RefObject<Map<string, PageSessionHandle>>,
  key: string,
  stopped: RefObject<boolean>,
): Promise<PageSessionHandle | undefined> {
  const deadline = Date.now() + SESSION_READY_TIMEOUT_MS;
  while (!stopped.current && Date.now() < deadline) {
    const handle = sessions.current.get(key);
    if (handle) return handle;
    await wait(SESSION_POLL_MS);
  }
  return undefined;
}

/**
 * Run all pages: confirm with fresh node counts, then run each page in order through its own
 * session, which `progress.pageId` keeps mounted, so switching pages never cuts a run short.
 */
export function useRunAllPages(options: {
  projectId?: string;
  sessions: RefObject<Map<string, PageSessionHandle>>;
  activeKey: string;
}) {
  const { projectId, sessions, activeKey } = options;
  const { t } = useTranslate();
  const pushToast = useToastStore((state) => state.push);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rows, setRows] = useState<RunAllPageRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState<RunAllProgress | null>(null);
  const stopped = useRef(false);
  const currentKey = useRef<string | null>(null);
  // A reopened dialog must not show the counts of an older read that lands late.
  const readToken = useRef(0);

  const activeKeyRef = useRef(activeKey);
  useEffect(() => {
    activeKeyRef.current = activeKey;
  });

  const openDialog = useCallback(async () => {
    if (!projectId) return;
    const token = (readToken.current += 1);
    setDialogOpen(true);
    setRows(null);
    setFailed(false);
    try {
      // The open page's latest edits count too, so they are saved before the totals are read.
      await sessions.current.get(activeKeyRef.current)?.graphApi.current?.flushSave?.();
      const pages = await listPages(projectId);
      if (token === readToken.current) setRows(runAllRows(pages));
    } catch (err) {
      console.error("[workflow] reading pages for Run all pages failed", err);
      if (token !== readToken.current) return;
      setRows([]);
      setFailed(true);
    }
  }, [projectId, sessions]);

  const confirm = useCallback(async () => {
    const pages = rows ?? [];
    setDialogOpen(false);
    if (!pages.length) return;
    stopped.current = false;
    const results: RunGraphResult[] = [];
    let skipped = 0;
    for (const [index, page] of pages.entries()) {
      if (stopped.current) break;
      currentKey.current = page.id;
      setProgress({ index, total: pages.length, pageId: page.id, name: page.name });
      const handle = await waitForSession(sessions, page.id, stopped);
      if (stopped.current) break;
      try {
        if (!handle) throw new Error("the page never mounted");
        results.push(await handle.run());
      } catch (err) {
        // One page that will not open must not hold the rest back.
        console.error("[workflow] a page could not run", err);
        skipped += 1;
      }
    }
    currentKey.current = null;
    setProgress(null);
    const totals = sumRuns(results);
    const toast = runSummary(
      { ...totals, aborted: totals.aborted || stopped.current },
      t,
      results.length,
    );
    if (toast) pushToast(toast.message, toast.tone);
    if (skipped > 0) {
      pushToast(t("appChat.flow.run.allPagesSkipped").replace("{n}", String(skipped)), "error");
    }
  }, [rows, sessions, pushToast, t]);

  // Stops the page in flight and every page after it.
  const stop = useCallback(() => {
    stopped.current = true;
    const key = currentKey.current;
    if (key) sessions.current.get(key)?.stop();
  }, [sessions]);

  return {
    progress,
    dialog: { open: dialogOpen, rows, failed, onOpenChange: setDialogOpen },
    openDialog,
    confirm,
    stop,
  };
}
