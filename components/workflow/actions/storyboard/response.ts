import type { Asset } from "@dogclaw-ad/workflow";
import { resolveJobImageAssets } from "../../shared/response";
import { STORYBOARD_FEATURE } from "./constants";

/** With `runs` > 1 every alternative board comes back and the node shows a carousel. */
export function resolveStoryboardAssets(
  jobId: string,
  signal?: AbortSignal,
): Promise<Asset[]> {
  return resolveJobImageAssets(jobId, STORYBOARD_FEATURE, signal);
}
