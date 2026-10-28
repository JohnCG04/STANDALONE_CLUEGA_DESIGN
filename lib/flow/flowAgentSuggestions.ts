/**
 * The chips under the Flow Home launcher.
 *
 * `AgentLanding` draws them only when the host answers `listSuggestions` — the
 * package ships no copy of its own, because what this product is good at is not
 * something a generic chat surface can know.
 *
 * Dependency-free (no React, no router) like the other lib/flow helpers: it
 * takes the translator it is called with, so the copy lives in the dictionaries
 * with every other string on the page.
 */

import type { AgentSuggestion } from "@dogclaw-ad/workflow-agent";

const BASE = "appChat.flow.home.agentSuggestions";

/**
 * The pool, by dictionary key. Wider than what is shown at once, which is what
 * makes Shuffle worth pressing: each call deals a fresh hand from it.
 */
const POOL = [
  "socialCarousel",
  "productMockup",
  "ugcAd",
  "brandKit",
  "productPhotos",
  "youtubeShort",
] as const;

/** How many chips fit on one line beside the shuffle button. */
const SHOWN = 3;

/** Fisher-Yates over a copy — the pool itself is a module constant. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Deal `SHOWN` suggestions.
 *
 * `label` is what the chip says; `prompt` is what pressing it types into the
 * composer — the whole brief, not the name, because the name alone would leave
 * the agent to invent the request.
 */
export function flowAgentSuggestions(
  t: (path: string) => string,
): AgentSuggestion[] {
  return shuffled(POOL)
    .slice(0, SHOWN)
    .map((id) => ({
      id,
      label: t(`${BASE}.${id}.label`),
      prompt: t(`${BASE}.${id}.prompt`),
    }));
}
