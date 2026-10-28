// One read may hold several frames or half of one, so the buffer is kept across reads.

import type { SseFrame } from "./types";

/** Turn one frame's raw text into `{ event, data }`, or null if it carries none. */
export function parseFrame(block: string): SseFrame | null {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    // A leading colon is a comment — servers send them as keep-alives.
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }

  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

/**
 * Yield frames from a response body until it ends or `signal` aborts.
 * Cancels the reader on the way out, so a stopped stream does not hold the connection open.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      // `stream: true` keeps a multi-byte character split across reads from decoding twice.
      buffer += decoder.decode(value, { stream: true });

      // `\r\n` is accepted too: a proxy may rewrite line endings even when the origin does not.
      let sep: number;
      while ((sep = findFrameEnd(buffer)) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, "");
        const frame = parseFrame(block);
        if (frame) yield frame;
      }
    }

    // Some servers end the body right after the last frame, with no trailing blank line.
    const tail = parseFrame(buffer + decoder.decode());
    if (tail) yield tail;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Index of the first frame terminator, or -1. */
function findFrameEnd(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}
