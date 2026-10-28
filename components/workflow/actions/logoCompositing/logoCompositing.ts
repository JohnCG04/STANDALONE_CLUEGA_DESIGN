import type { Asset, GenResult, LogoCompositeRequest } from "@dogclaw-ad/workflow";
import { createMediaJob } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { pollJobImageUrls } from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import type { FlowJobTrack } from "../../shared/types";
import { unproxyImageInput } from "../../shared/mediaProxy";
import { assertPubliclyFetchable } from "../../shared/helpers";
import { STOP_CANCEL } from "../../shared/constants";
import { watchJob } from "../../shared/jobStop";
import { createRemoveBackgroundJob } from "../../shared/mediaJob";
import {
  LOGO_COMPOSITE_FEATURE,
  LOGO_COMPOSITE_IMAGE_MODEL,
  MAX_LOGO_COMPOSITE_CREATIVES,
} from "./constants";
import { compositeOnCanvas } from "./compositeCanvas";
import { normalizeLogoCompositeRequest } from "./helpers";
import { resolveLogoGeometry } from "./logoGeometry";
import {
  measureImageFrame,
  measureLogoArtwork,
} from "./logoMetrics";
import { buildLogoCompositePrompt } from "./logoPrompt";
import { LOGO_COMPOSITE_MESSAGES, LOGO_COMPOSITE_WARNINGS } from "./messages";
import { resolveCompositeAsset } from "./response";
import type { LogoArtwork } from "./types";

/** One matte per brand asset; promises are cached so racing creatives share one job. */
const logoCutouts = new Map<string, Promise<string | null>>();

/** A mark on a white card gets stamped WITH the card, whatever the prompt says.
 *  Best-effort: a failed matte returns `null` and the caller composites the original. */
function cutOutLogo(logoUrl: string, workflowId?: string): Promise<string | null> {
  const known = logoCutouts.get(logoUrl);
  if (known) return known;

  const pending = (async () => {
    try {
      const jobId = await createRemoveBackgroundJob(logoUrl, workflowId);
      const urls = await pollJobImageUrls(jobId);
      return urls[0] ?? null;
    } catch (err) {
      console.warn(LOGO_COMPOSITE_WARNINGS.cutOutFailed, err);
      return null;
    }
  })().then((url) => {
    // A transient failure must not pin this logo to "no cut-out" for the session.
    if (!url) logoCutouts.delete(logoUrl);
    return url;
  });

  logoCutouts.set(logoUrl, pending);
  return pending;
}

/** Skips the matte when the asset has alpha (it could eat a thin stroke); an UNREADABLE logo is
 *  matted anyway: a redundant job costs seconds, a skipped one a white box. */
async function resolveCompositeLogo(
  logoUrl: string,
  workflowId?: string,
): Promise<{ url: string; cutout: boolean; artwork: LogoArtwork | null }> {
  const original = await measureLogoArtwork(logoUrl);
  if (original?.hasAlpha === true) {
    return { url: logoUrl, cutout: true, artwork: original };
  }

  const matted = await cutOutLogo(logoUrl, workflowId);
  if (!matted) return { url: logoUrl, cutout: false, artwork: original };

  // Re-measure: the matte is what the model sees, and its trim box defines every size number.
  return {
    url: matted,
    cutout: true,
    artwork: (await measureLogoArtwork(matted)) ?? original,
  };
}

/** Stamp ONE logo on each creative in node order: matte first, then a canvas draw per creative,
 *  or with `printOnSurface` ONE AI JOB PER CREATIVE (a stop cancels each; the matte finishes). */
export async function compositeLogo(
  req: LogoCompositeRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  // Both inputs are fetched server-side; folded `transforms` aren't applied there yet.
  const batch = normalizeLogoCompositeRequest({
    ...req,
    images: (req.images ?? []).map((image: any) => unproxyImageInput(image)),
    ...(req.logo ? { logo: unproxyImageInput(req.logo) } : {}),
  });

  if (batch.creativeUrls.length === 0) {
    throw new Error(LOGO_COMPOSITE_MESSAGES.noCreatives);
  }
  if (!batch.logoUrl) throw new Error(LOGO_COMPOSITE_MESSAGES.noLogo);

  assertPubliclyFetchable(
    [...batch.creativeUrls, batch.logoUrl],
    LOGO_COMPOSITE_FEATURE,
  );

  const creativeUrls = batch.creativeUrls.slice(0, MAX_LOGO_COMPOSITE_CREATIVES);
  if (creativeUrls.length < batch.creativeUrls.length) {
    console.warn(
      LOGO_COMPOSITE_WARNINGS.capped(
        MAX_LOGO_COMPOSITE_CREATIVES,
        batch.creativeUrls.length,
      ),
    );
  }

  const logo = await resolveCompositeLogo(batch.logoUrl, workflowId);

  // The default: an AI redraw scales the mark by its own judgement, so the blend changed its size.
  if (!batch.printOnSurface) {
    const assets = await compositeOnCanvas(batch, creativeUrls, logo, workflowId, req.signal);
    return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
  }

  const assets = await Promise.all(
    creativeUrls.map(async (creativeUrl, index) => {
      // A `null` frame drops the prompt to prose.
      const frame = await measureImageFrame(creativeUrl);
      const geometry = resolveLogoGeometry(batch, index, frame, logo.artwork);
      const prompt = buildLogoCompositePrompt(batch, geometry, {
        cutout: logo.cutout,
      });

      req.signal?.throwIfAborted();
      const jobId = await createMediaJob(
        prompt,
        undefined,
        LOGO_COMPOSITE_IMAGE_MODEL,
        // Order matters: the prompt addresses these as Input Image 1 / 2.
        [creativeUrl, logo.url],
        "image",
        undefined, // one composite per creative; the node has no variant count
        undefined, // no aspect_ratio — the output inherits the creative's frame
        workflowId,
        undefined,
        undefined,
        undefined,
        undefined,
        track?.target,
      );
      // Same seq for every creative: the batch is one ledger submit, which must know every id.
      track?.onCreated?.([jobId], jobId);

      return watchJob(
        req.signal,
        () => cancelJobGroup(jobId, STOP_CANCEL),
        (signal) => resolveCompositeAsset(jobId, signal),
      );
    }),
  );

  return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
}
