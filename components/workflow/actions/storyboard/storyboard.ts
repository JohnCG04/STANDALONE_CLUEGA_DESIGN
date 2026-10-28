import type { Asset, GenResult, StoryboardRequest } from "@dogclaw-ad/workflow";
import { createMediaJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import type { FlowJobTrack } from "../../shared/types";
import { STOP_CANCEL } from "../../shared/constants";
import { watchJob } from "../../shared/jobStop";
import { unproxyImageInput } from "../../shared/mediaProxy";
import { STORYBOARD_IMAGE_MODEL } from "./constants";
import { buildStoryboardPrompt, normalizeStoryboardRequest } from "./helpers";
import { STORYBOARD_MESSAGES } from "./messages";
import { resolveStoryboardAssets } from "./response";

/** The board is ONE grid image (keeps cast, light and product consistent), so `runs` means
 *  "how many alternative boards", sent as the job's `n`. */
export async function generateStoryboard(
  req: StoryboardRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {

  // The backend fetches references server-side; folded `transforms` aren't applied.
  const board = normalizeStoryboardRequest({
    ...req,
    references: (req.references ?? []).map(unproxyImageInput),
  });

  if (!board.prompt) throw new Error(STORYBOARD_MESSAGES.noScene());

  req.signal?.throwIfAborted();
  const group = await createMediaJobGroup(
    buildStoryboardPrompt(board),
    undefined,
    STORYBOARD_IMAGE_MODEL,
    board.referenceUrls,
    "image",
    board.runs,
    board.aspectRatio,
    workflowId,
    undefined, // isPromptEnhance — the board's prompt is built here, not rewritten
    undefined, // skills — not a chat surface
    undefined, // creative — the board's references ride inputFiles
    undefined, // locale
    track?.target,
    undefined, // aspectExplicit — the board's ratio comes from the node, not a human
    undefined, // intentOptions — no gate was asked
    undefined, // style
    undefined, // resolution
    undefined, // brandId
    { clone_fidelity: "structure" },
  );
  track?.onCreated?.(group.jobIds, group.groupId);

  const assets = await watchJob(
    req.signal,
    () => cancelJobGroup(group.groupId, STOP_CANCEL),
    (signal) => resolveStoryboardAssets(group.jobId, signal),
  );
  return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
}
