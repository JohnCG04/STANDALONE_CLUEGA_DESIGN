import type { PromptEnhanceRequest } from "@dogclaw-ad/workflow";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { PROMPT_ENHANCE_MESSAGES } from "../../shared/messages";
import { rewritePromptViaChat } from "./promptEnhanceApi";

/** A production-ready prompt for the Copilot node and the enhance-wand. TEXT only; with images,
 *  the chat agent reads only the FIRST one, as `input_files`. */
export async function enhancePrompt(
  req: PromptEnhanceRequest,
  workflowId?: string,
): Promise<string> {
  const prompt = req.context ? `${req.context}\n\n${req.prompt}` : req.prompt;

  const images = req.images ?? [];
  if (images.length > 0) {
    const image = images[0];

    // Edits ride as a `transforms[]` recipe on the BASE url, which would enhance the wrong image.
    if (image.transforms && image.transforms.length > 0) {
      throw new Error(PROMPT_ENHANCE_MESSAGES.unbakedEdits);
    }

    // No artifact upload — that round-trip tripped a 415 (octet-stream).
    const rawUrl = image.url ? toJobInputUrl(image.url) : "";
    if (!rawUrl) throw new Error(PROMPT_ENHANCE_MESSAGES.noSourceUrl);

    const enriched = (
      await rewritePromptViaChat(
        {
          prompt: prompt.trim() || PROMPT_ENHANCE_MESSAGES.describeImage,
          model: req.model,
          inputFiles: [rawUrl],
          workflowId,
        },
        req.signal,
      )
    ).trim();
    if (!enriched) throw new Error(PROMPT_ENHANCE_MESSAGES.noImageText);
    return enriched;
  }

  const enriched = (
    await rewritePromptViaChat(
      { prompt, model: req.model, workflowId },
      req.signal,
    )
  ).trim();
  if (!enriched) throw new Error(PROMPT_ENHANCE_MESSAGES.noText);
  return enriched;
}
