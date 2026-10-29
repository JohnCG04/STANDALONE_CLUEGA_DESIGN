/** Captions on the REAL request body: heard speech needs no script and names its source and
 *  spoken language; a script run still refuses an empty script before anything is sent. */

import assert from "node:assert/strict";
import test from "node:test";

import { burnCaptions } from "../captions";

const VIDEO = { url: "https://pub-29a18e256ef041649a1fe398bf3cd0b9.r2.dev/clip.mp4" };

type Body = { options?: Record<string, unknown> };

/** The POST body for one submit; a 502 stops the run before the poll loop. */
async function submittedBody(req: Record<string, unknown>): Promise<Body | undefined> {
  let body: Body | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: string, init: RequestInit = {}) => {
    if ((init.method ?? "GET").toUpperCase() === "POST") {
      body = JSON.parse(String(init.body ?? "{}")) as Body;
    }
    return new Response("upstream down", { status: 502 });
  }) as typeof fetch;
  try {
    await assert.rejects(burnCaptions(req as never));
  } finally {
    globalThis.fetch = original;
  }
  return body;
}

test("heard speech is sent with no script, its source and the spoken language", async () => {
  const body = await submittedBody({ video: VIDEO, source: "auto", scriptText: "", language: "vi" });

  assert.equal(body?.options?.video_edit_op, "captions_apply");
  assert.equal(body?.options?.caption_source, "auto");
  assert.equal(body?.options?.caption_language, "vi");
  assert.equal(body?.options?.caption_script, "");
});

test("a script run with an empty script is refused before anything is sent", async () => {
  const body = await submittedBody({ video: VIDEO, source: "script", scriptText: "  " });

  assert.equal(body, undefined);
});

test("a typed script still goes out as the caption script", async () => {
  const body = await submittedBody({ video: VIDEO, source: "script", scriptText: "Xin chào." });

  assert.equal(body?.options?.caption_source, "script");
  assert.equal(body?.options?.caption_script, "Xin chào.");
  assert.equal(body?.options?.caption_language, undefined);
});
