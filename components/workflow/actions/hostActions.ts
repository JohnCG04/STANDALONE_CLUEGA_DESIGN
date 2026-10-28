import type {
  Asset,
  AssetAction,
  AssetKind,
  BurnCaptionsRequest,
  DubVideoRequest,
  FaceDetectRequest,
  FaceDetectResult,
  FaceSwapRequest,
  GenAudioRequest,
  GenImageRequest,
  GenResult,
  GenVideoRequest,
  GenerativeFillRequest,
  LogoCompositeRequest,
  MultiCameraAnglesRequest,
  PromptEnhanceRequest,
  RelightRequest,
  RemoveBackgroundRequest,
  TranscribeAudioRequest,
  TranscribeAudioResult,
  TranslateVoiceRequest,
  MagicLayerRequest,
  MagicLayerResult,
  ResizeImageRequest,
  StoryboardRequest,
  VideoFaceSwapRequest,
  WorkflowActions,
  WorkflowAsset,
} from "@dogclaw-ad/workflow";

// Aliased: `deleteAsset` is an action key here, and `deleteWorkflowAsset` is in scope too.
import { deleteAsset as deleteCdpAsset } from "@/lib/cdp/assetsClient";
import type { FlowJobKind } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

import { detectFacesInImage, swapFace } from "./faceSwap";
import { generativeFill } from "./generativeFill";
import { swapFaceVideo } from "./videoFaceSwap";
import { dubVideo, getDubCapabilities, listDubVoices } from "./dub";
import { burnCaptions } from "./captions";
import { compositeLogo } from "./logoCompositing";
import { resizeImage } from "./resizeImage";
import { generateStoryboard } from "./storyboard";
import type { FlowJobSubmitter, TrackedRequest } from "./types";
import type { FlowJobTrack } from "../shared/types";
import { notifyGeneratedAssets } from "../shared/generatedAssets";
import { isAbortError, stoppedError } from "../shared/jobStop";
import {
  autoSaveDocument,
  deleteWorkflowAsset,
  downloadWorkflowAsset,
  renameWorkflowProject,
  resolveDownloadBlob,
  screenWorkflowUploads,
  uploadFilesToArtifacts,
} from "../shared";
import {
  decomposeLayers,
  enhancePrompt,
  generateAudio,
  generateImage,
  generateVideo,
  listVoiceSamples,
  multiCameraAngles,
  relight,
  removeBackground,
  transcribeAudio,
  translateVoice,
} from "./basic";

/** The editor's side effects: the package is HEADLESS, so each entry routes one action to its
 *  owner (`./basic` sends input to a prompt; feature folders pre-process on the client first). */
const baseHostActions: WorkflowActions = {
  generateImage: (req: GenImageRequest): Promise<GenResult> =>
    generateImage(req),
  removeBackground: (req: RemoveBackgroundRequest): Promise<GenResult> =>
    removeBackground(req),
  decomposeLayers: (req: MagicLayerRequest): Promise<MagicLayerResult> =>
    decomposeLayers(req),
  resizeImage: (req: ResizeImageRequest): Promise<GenResult> => resizeImage(req),
  onMultiCameraAngles: (req: MultiCameraAnglesRequest): Promise<GenResult> =>
    multiCameraAngles(req),
  relight: (req: RelightRequest): Promise<GenResult> => relight(req),
  generativeFill: (req: GenerativeFillRequest): Promise<GenResult> =>
    generativeFill(req),
  onGenerateStoryboard: (req: StoryboardRequest): Promise<GenResult> =>
    generateStoryboard(req),
  compositeLogo: (req: LogoCompositeRequest): Promise<GenResult> =>
    compositeLogo(req),
  swapFace: (req: FaceSwapRequest): Promise<GenResult> => swapFace(req),
  swapFaceVideo: (req: VideoFaceSwapRequest): Promise<GenResult> =>
    swapFaceVideo(req),
  dubVideo: (req: DubVideoRequest): Promise<GenResult> => dubVideo(req, ""),
  getDubCapabilities,
  listDubVoices,
  burnCaptions: (req: BurnCaptionsRequest): Promise<GenResult> =>
    burnCaptions(req),
  generateVideo: (req: GenVideoRequest): Promise<GenResult> =>
    generateVideo(req),
  generateAudio: (req: GenAudioRequest): Promise<GenResult> =>
    generateAudio(req),
  listVoiceSamples,
  translateVoice: (req: TranslateVoiceRequest): Promise<GenResult> =>
    translateVoice(req),
  transcribeAudio: (req: TranscribeAudioRequest): Promise<TranscribeAudioResult> =>
    transcribeAudio(req),
  enhancePrompt: (req: PromptEnhanceRequest): Promise<string> =>
    enhancePrompt(req),
  onUploadFile: (files: File[]): Promise<Asset[]> =>
    uploadFilesToArtifacts(files),
  screenUploads: (files: File[]): Promise<File[]> =>
    screenWorkflowUploads(files),
  detectFaces: (req: FaceDetectRequest): Promise<FaceDetectResult> =>
    detectFacesInImage(req),
  resolveDownload: (asset: Asset): Promise<Blob | string> =>
    resolveDownloadBlob(asset),
  deleteAsset: (asset: { id?: string; url: string; kind: AssetKind }): void =>
    deleteWorkflowAsset(asset),
};

/** One AI action through the page's job ledger: success marks the submit applied, a STOP closes it
 *  `stopped`, and a rejection writes nothing terminal (the gateway already recorded the truth). */
export async function trackJob<T>(
  ledger: FlowJobSubmitter | undefined,
  req: TrackedRequest | undefined,
  kind: FlowJobKind,
  run: (track?: FlowJobTrack) => Promise<T>,
): Promise<T> {
  const track = ledger?.beginSubmit(req?.nodeId, kind);
  let result: T;
  try {
    result = await run(track);
  } catch (err) {
    if (req?.signal?.aborted || isAbortError(err)) ledger?.stopSubmit(track);
    throw err;
  }
  if (req?.signal?.aborted) {
    ledger?.stopSubmit(track);
    throw stoppedError();
  }
  ledger?.completeSubmit(track);
  // The job also filed an asset; the Assets panel otherwise only learns of it on reload.
  notifyGeneratedAssets();
  return result;
}

/** The `actions` prop, bound to a saved project (`workflow_id` on every job); `pageId` only targets
 *  autosave. Only media-job actions use `ledger`; `applyBrandKit` is a getter read at submit. */
export function createWorkflowHostActions(
  projectId?: string,
  pageId?: string,
  ledger?: FlowJobSubmitter,
  applyBrandKit?: () => boolean,
): WorkflowActions {
  if (!projectId) return baseHostActions;
  return {
    ...baseHostActions,
    onAutoSave: (doc: any) => autoSaveDocument(projectId, doc, pageId),
    renameWorkflow: (title: any) => renameWorkflowProject(projectId, title),
    generateImage: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        generateImage(req, projectId, track, applyBrandKit?.() ?? true),
      ),
    removeBackground: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        removeBackground(req, projectId, track),
      ),
    decomposeLayers: (req: any) =>
      trackJob(ledger, req?.nodeId, "image", (track) =>
        decomposeLayers(req, projectId, track),
      ),
    resizeImage: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        resizeImage(req, projectId, track),
      ),
    onMultiCameraAngles: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        multiCameraAngles(req, projectId, track),
      ),
    relight: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        relight(req, projectId, track),
      ),
    generativeFill: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        generativeFill(req, projectId, track),
      ),
    onGenerateStoryboard: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        generateStoryboard(req, projectId, track),
      ),
    compositeLogo: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        compositeLogo(req, projectId, track),
      ),
    swapFace: (req: any) =>
      trackJob(ledger, req, "image", (track) =>
        swapFace(req, projectId, track),
      ),
    swapFaceVideo: (req: any) =>
      trackJob(ledger, req, "video", (track) =>
        swapFaceVideo(req, projectId, track),
      ),
    dubVideo: (req: any) =>
      trackJob(ledger, req?.nodeId, "video", (track) => dubVideo(req, projectId, track)),
    burnCaptions: (req: any) =>
      trackJob(ledger, req?.nodeId, "video", (track) =>
        burnCaptions(req, projectId, track),
      ),
    generateVideo: (req: any) =>
      trackJob(ledger, req, "video", (track) =>
        generateVideo(req, projectId, track),
      ),
    generateAudio: (req: any) =>
      trackJob(ledger, req, "audio", (track) =>
        generateAudio(req, projectId, track),
      ),
    translateVoice: (req: any) =>
      trackJob(ledger, req, "audio", (track) =>
        translateVoice(req, projectId, track),
      ),
    // Text out, like enhancePrompt: nothing for the job ledger to replay onto the node.
    transcribeAudio: (req: any) => transcribeAudio(req, projectId),
    enhancePrompt: (req: any) => enhancePrompt(req, projectId),
    onUploadFile: (files: any) => uploadFilesToArtifacts(files, projectId),
  };
}

/** Fire-and-forget, no toast surface. Delete is SOFT (recycle bin): the bytes stay, so a node
 *  rendering that url keeps its image; the client broadcasts `asset.deleted` to other readers. */
export function createWorkflowAssetActionHandler({
  onDeleted,
}: {
  onDeleted: (id: string) => void;
}): (action: AssetAction, asset: WorkflowAsset) => void {
  return (action, asset) => {
    switch (action) {
      case "download":
        void downloadWorkflowAsset(asset).catch((err) =>
          console.error("[workflow] asset download failed", err),
        );
        return;
      case "delete": {
        void deleteCdpAsset(asset.id)
          .then((result) => {
            // `deleted: 0` is another user's shared file: the row stays, so the card does too.
            if (result.deleted === 0) {
              console.warn("[workflow] asset was not deleted", asset.id, result);
              return;
            }
            onDeleted(asset.id);
          })
          .catch((err) => {
            console.error("[workflow] asset delete failed", err);
          });
        return;
      }
    }
  };
}
