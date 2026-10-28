import type { Asset } from "@dogclaw-ad/workflow";
import { resolveJobImageAssets } from "../../shared/response";
import { LOGO_COMPOSITE_FEATURE } from "./constants";

/** Extra urls are dropped: the batch must stay one asset per creative, in order. */
export async function resolveCompositeAsset(
  jobId: string,
  signal?: AbortSignal,
): Promise<Asset> {
  const assets = await resolveJobImageAssets(
    jobId,
    LOGO_COMPOSITE_FEATURE,
    signal,
  );
  return assets[0];
}
