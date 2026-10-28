"use client";

/**
 * The screen that appears instead of a white page.
 *
 * WHAT WAS BROKEN. This app had no error boundary anywhere — no `error.tsx`, no
 * `global-error.tsx`, no boundary component, and every one of the twenty views
 * rendered in one tree under `AppPage`. So a single throw anywhere in a render
 * took the whole document with it and left Next's built-in last-resort page: a
 * blank white screen. QA reported exactly that ("白畫面"), and there was no way
 * for them to report anything more useful, because the screen said nothing —
 * not which screen died, not what threw, not that a reload would help.
 *
 * That is the defect this file fixes. It does NOT fix whatever threw: it makes a
 * throw legible and survivable, which is the part that was missing.
 *
 * THREE THINGS IT DOES, in order of who needs them.
 *
 *  · The reader keeps the app. The boundary sits inside the shell, so the
 *    sidebar stays mounted and they can navigate to another screen. A boundary
 *    at the route level would have been less work and would have replaced the
 *    whole window, leaving a reload as the only way out.
 *  · The reader gets a retry. Not decoration: a crash caused by a race, or by
 *    one bad response now out of the cache, comes back on the second render. A
 *    deterministic one re-throws, and the same panel returns — honest either way.
 *  · The REPORTER gets the error text, on screen and copyable. This is the part
 *    that turns a white screen into a bug someone can act on. A screenshot of a
 *    blank page names nothing; a screenshot of this names the view and the
 *    message.
 *
 * WHY A CLASS. `getDerivedStateFromError` is the only way to catch a render
 * throw in React, and it has no hook equivalent. The panel it renders is a
 * function component so it can use `useTranslate` — a class cannot.
 *
 * WHY THE VIEW ID IS NOT TRANSLATED. `viewName` is `activeView` verbatim —
 * `account-list`, not 帳號列表. It is shown as an identifier, next to the error,
 * for someone filing or reading a report. Mapping it to display copy would add a
 * table that silently drifts as views are added, and would hand the reporter a
 * word that does not appear anywhere in the source they need to search.
 */

import { Component, Fragment, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";

const k = (suffix: string) => `appChat.viewCrash.${suffix}`;

type Props = {
  /** `activeView`, verbatim. Logged and shown as an identifier — never as prose. */
  viewName: string;
  /** Drawn in place of the crash panel, e.g. a column's own frame. Defaults to the panel. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  children: ReactNode;
};

type State = {
  error: Error | null;
  /** Bumped by a retry, to remount the subtree rather than re-show its last render. */
  attempt: number;
};

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // Named on purpose. React's own production log gives a component stack with
    // minified names and no route; this line says which view of the app died,
    // which is the first question anyone asks. It is the only diagnostic a
    // reporter on a production build can copy out of the console.
    console.error(
      `[cluega] the "${this.props.viewName}" view threw during render`,
      error,
      info?.componentStack ?? "",
    );
  }

  private retry = () => {
    this.setState((current) => ({ error: null, attempt: current.attempt + 1 }));
  };

  render() {
    if (this.state.error !== null) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.retry);
      return (
        <ViewCrashPanel
          viewName={this.props.viewName}
          error={this.state.error}
          onRetry={this.retry}
        />
      );
    }
    /*
      A Fragment, not a div: the views are direct children of a flex `<main>` and
      an extra element would change every one of their layouts. The key is what
      makes the retry a remount — without it React reuses the subtree that just
      threw and nothing is re-attempted.
    */
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

const ViewCrashPanel = ({
  viewName,
  error,
  onRetry,
}: {
  viewName: string;
  error: Error;
  onRetry: () => void;
}) => {
  const { t } = useTranslate();
  // `error.message` alone on a production build is often a minified one-liner,
  // so the view id and the name of the error class go with it. This is the text
  // a reporter is asked to include, so it has to be enough to search for.
  const report = `${viewName} · ${error.name}: ${error.message}`;

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
      <div className="mt-10 w-full max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-amber-900 dark:text-amber-100">
              {t(k("title"))}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed font-normal text-amber-900/80 dark:text-amber-100/80">
              {t(k("body"))}
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-900 px-3 text-[13px] font-semibold text-white hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
            >
              <RotateCcw className="size-4" aria-hidden />
              {t(k("retry"))}
            </button>

            {/*
              Open by default, and deliberately so. Collapsed behind a summary it
              would be one more thing a reporter has to know to click, and the
              whole point of this panel is that the next report carries the text.
            */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-amber-900/70 dark:text-amber-100/70">
                {t(k("details"))}
              </p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-amber-200 bg-white/70 p-2.5 text-[11px] leading-relaxed font-normal whitespace-pre-wrap break-words text-amber-950 dark:border-amber-900/50 dark:bg-black/20 dark:text-amber-50">
                {report}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
