import type { DetectedTextRegion } from '../mediaImageClient'

export type ImageFilters = {
  brightness: number
  contrast: number
  saturation: number
}

export type CanvasElement = {
  id: string
  // The image ref (job imageId / generated URL) this element maps back to. Stays
  // stable across clone/paste so a canvas object always traces to its source image.
  sourceImageId?: string
  // Media-library artifact id of an AI-GENERATED element (the media-gen job's
  // output_refs). Absent for a user-provided/imported image: only generated media has
  // a library id. Carried so "Use for Ad" can hand it to the ad flow, which reports it
  // as the ad's creative_ids — the display url alone cannot be resolved back to it.
  artifactId?: string
  storyboard?: {
    projectId: string
    sceneId: number
    previewArtifactId?: string
  }
  isPlaceholder?: boolean
  // For a video generated FROM a canvas image: the artifact id of THAT source image.
  // Reported alongside the video so the report records which image produced it.
  sourceArtifactId?: string
  // Which media this element holds. Absent/'image' → a still image (the default, so
  // legacy elements keep working). 'video' → `imageUrl` is a video URL, rendered via
  // an <video> element into Konva with playback controls (see CanvasImage/useVideo).
  mediaType?: 'image' | 'video'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  // For a video element this holds the video URL (kept as `imageUrl` so the whole
  // canvas — layout, persistence, selection — treats it uniformly with images).
  imageUrl: string
  title: string
  isProcessing?: boolean
  isEditingText?: boolean
  isDetectingText?: boolean
  isGenerating?: boolean
  generatingKind?: 'image' | 'video'
  /** How far the job behind this placeholder has got, 0–100. Absent until the
   *  backend's first `job_progress` frame — no number means no number, rather
   *  than an invented one. */
  generatingPct?: number
  autoFit?: boolean
  textRegions: DetectedTextRegion[]
  filters: ImageFilters
  locked: boolean
  zIndex: number
}

export type CanvasViewport = {
  zoom: number
  panX: number
  panY: number
}

export type ClipboardData = {
  elements: CanvasElement[]
  pasteCount: number
}

export type ExportFormat = 'image/png' | 'image/jpeg'
