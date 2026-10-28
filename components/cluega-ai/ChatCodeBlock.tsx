"use client";

/**
 * A fenced code block in chat: the language it is in, and a way to take it.
 *
 * The assistant answers a lot of questions with code, and a block nobody can
 * copy is a block the reader retypes. The label earns its place too — a fence
 * with no language reads as prose the model forgot to explain.
 */

import { useCopiedFlag } from "@/hooks/useCopiedFlag";

interface ChatCodeBlockProps {
  code: string;
  language?: string;
  copyLabel: string;
  copiedLabel: string;
}

export function ChatCodeBlock({
  code,
  language,
  copyLabel,
  copiedLabel,
}: ChatCodeBlockProps) {
  const [copied, markCopied] = useCopiedFlag(1600);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      markCopied();
    } catch {
      // Clipboard is permission-gated and refuses in some embeds. The block is
      // still selectable by hand, so a failure needs no error of its own.
    }
  };

  return (
    <div className="group/code relative my-2">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted/60 px-3 py-1">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/code:opacity-100"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-lg border border-border bg-muted/60 p-3 text-[12px] leading-relaxed text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
