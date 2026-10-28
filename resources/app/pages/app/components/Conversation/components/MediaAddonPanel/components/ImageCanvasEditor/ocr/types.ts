export type OcrProgress = {
  status: 'loading' | 'recognizing' | 'done' | 'error'
  progress: number
  message?: string
}

export type OcrConfig = {
  languages: string[]
  workerPath?: string
  corePath?: string
}

export type OcrResult = {
  text: string
  regions: import('../mediaImageClient').DetectedTextRegion[]
  imageSize: { width: number; height: number }
  confidence: number
}
