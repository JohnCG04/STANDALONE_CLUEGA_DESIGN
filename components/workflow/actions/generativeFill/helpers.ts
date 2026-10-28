import type { GenerativeFillPlacement } from "@dogclaw-ad/workflow";
import {
  INPAINT_PROMPT_BASE,
  INPAINT_PROMPT_ERASE,
  INPAINT_PROMPT_FILL,
} from "./constants";

/** The contract first, then what to do with the region. */
export function inpaintPrompt(prompt: string | undefined): string {
  const typed = prompt?.trim();
  return `${INPAINT_PROMPT_BASE}\n\n${typed ? INPAINT_PROMPT_FILL(typed) : INPAINT_PROMPT_ERASE}`;
}

export function isPlacement(value: unknown): value is GenerativeFillPlacement {
  if (!value || typeof value !== "object") return false;
  const { x, y, width, height } = value as Record<string, unknown>;
  return [x, y, width, height].every(
    (n) => typeof n === "number" && Number.isFinite(n),
  );
}
