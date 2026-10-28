import { loadCanvasImage } from '../utils/loadCanvasImage'
import type { DetectedTextRegion, NormalizedCenter, NormalizedCorners, PixelCorners, PixelRect } from '../mediaImageClient'
import type { OcrConfig, OcrProgress, OcrResult } from './types'

type PaddleOcrPoint =
  | [number, number]
  | { x: number; y: number }
  | { 0: number; 1: number }

type PaddleOcrResult = {
  text?: string | string[]
  points?: unknown[]
  confidence?: number
}

type PaddleOcrModule = {
  init: () => Promise<void>
  recognize: (
    image: HTMLImageElement | HTMLCanvasElement,
    options?: {
      canvas?: HTMLCanvasElement
      style?: Record<string, unknown>
    },
  ) => Promise<PaddleOcrResult>
  detect?: (image: HTMLImageElement | HTMLCanvasElement) => Promise<unknown[]>
}

class TextRecognitionService {
  private ocr: PaddleOcrModule | null = null
  private loadingPromise: Promise<void> | null = null
  private cache = new Map<string, OcrResult>()
  private cacheVersion = 'paddlejs-ocr-v1'
  private config: OcrConfig = {
    languages: ['eng', 'vie'],
  }

  async initialize(onProgress?: (progress: OcrProgress) => void): Promise<void> {
    if (this.ocr) return
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = (async () => {
      onProgress?.({ status: 'loading', progress: 0, message: 'Loading Paddle OCR engine...' })

      const paddleOcr = await import('@paddlejs-models/ocr')
      await paddleOcr.init()
      this.ocr = paddleOcr

      onProgress?.({ status: 'loading', progress: 100, message: 'Paddle OCR engine ready' })
    })()

    return this.loadingPromise
  }

  async recognize(
    imageUrl: string,
    onProgress?: (progress: OcrProgress) => void,
  ): Promise<OcrResult> {
    const cacheKey = `${this.cacheVersion}:${imageUrl}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      onProgress?.({ status: 'done', progress: 100, message: 'Using cached result' })
      return cached
    }

    await this.initialize(onProgress)

    if (!this.ocr) {
      throw new Error('OCR worker not initialized')
    }

    onProgress?.({ status: 'recognizing', progress: 0, message: 'Processing image...' })

    const image = await this.loadImageElement(imageUrl)
    const actualImageSize = {
      width: image.naturalWidth || image.width || 1000,
      height: image.naturalHeight || image.height || 1000,
    }

    const result = await this.ocr.recognize(image)

    onProgress?.({ status: 'done', progress: 100, message: 'Recognition complete' })

    const regions = this.extractRegions(result, actualImageSize)

    const ocrResult: OcrResult = {
      text: this.resultText(result),
      regions,
      imageSize: actualImageSize,
      confidence: result.confidence ?? 0,
    }

    this.cache.set(cacheKey, ocrResult)
    return ocrResult
  }

  // Paddle OCR reads the bitmap's pixels (getImageData), so a tainted raw-url load is
  // useless here — ask for pixel access and let the error reach the panel banner.
  private async loadImageElement(imageUrl: string): Promise<HTMLImageElement> {
    const { image } = await loadCanvasImage(imageUrl, { requirePixelAccess: true })
    return image
  }

  private extractRegions(
    result: PaddleOcrResult,
    imageSize: { width: number; height: number },
  ): DetectedTextRegion[] {
    const texts = this.resultTexts(result)
    const boxes = this.resultBoxes(result)

    console.log(`[OCR] Found ${boxes.length} Paddle OCR text boxes`)

    return boxes.map((bbox, index) => {
      const paddedBox = this.expandBbox(bbox, imageSize)
      const text = texts[index] || texts.join(' ').trim() || `Text ${index + 1}`

      const pixelRect: PixelRect = {
        x: Math.round(paddedBox.x0),
        y: Math.round(paddedBox.y0),
        width: Math.round(paddedBox.x1 - paddedBox.x0),
        height: Math.round(paddedBox.y1 - paddedBox.y0),
      }

      const pixelCorners: PixelCorners = {
        top_left: { x: Math.round(paddedBox.x0), y: Math.round(paddedBox.y0) },
        top_right: { x: Math.round(paddedBox.x1), y: Math.round(paddedBox.y0) },
        bottom_right: { x: Math.round(paddedBox.x1), y: Math.round(paddedBox.y1) },
        bottom_left: { x: Math.round(paddedBox.x0), y: Math.round(paddedBox.y1) },
      }

      const normalizedRect = {
        x: this.clamp01(paddedBox.x0 / imageSize.width),
        y: this.clamp01(paddedBox.y0 / imageSize.height),
        width: this.clamp01((paddedBox.x1 - paddedBox.x0) / imageSize.width),
        height: this.clamp01((paddedBox.y1 - paddedBox.y0) / imageSize.height),
      }

      const normalizedCorners: NormalizedCorners = {
        top_left: { x: normalizedRect.x, y: normalizedRect.y },
        top_right: { x: normalizedRect.x + normalizedRect.width, y: normalizedRect.y },
        bottom_right: { x: normalizedRect.x + normalizedRect.width, y: normalizedRect.y + normalizedRect.height },
        bottom_left: { x: normalizedRect.x, y: normalizedRect.y + normalizedRect.height },
      }

      const normalizedCenter: NormalizedCenter = {
        x: normalizedRect.x + normalizedRect.width / 2,
        y: normalizedRect.y + normalizedRect.height / 2,
      }

      return {
        id: crypto.randomUUID(),
        normalizedRect,
        originalText: text,
        modifiedText: text,
        imagePixelSize: imageSize,
        pixelRect,
        pixelCorners,
        normalizedCorners,
        normalizedCenter,
      }
    })
  }

  private expandBbox(
    bbox: { x0: number; y0: number; x1: number; y1: number } | undefined,
    imageSize: { width: number; height: number },
  ) {
    if (!bbox) return { x0: 0, y0: 0, x1: 0, y1: 0 }

    const width = bbox.x1 - bbox.x0
    const height = bbox.y1 - bbox.y0

    const xPad = Math.max(4, Math.min(18, width * 0.05))
    const yPad = Math.max(5, Math.min(22, height * 0.25))

    return {
      x0: Math.max(0, bbox.x0 - xPad),
      y0: Math.max(0, bbox.y0 - yPad),
      x1: Math.min(imageSize.width, bbox.x1 + xPad),
      y1: Math.min(imageSize.height, bbox.y1 + yPad),
    }
  }

  private resultTexts(result: PaddleOcrResult) {
    if (Array.isArray(result.text)) {
      return result.text.map((text) => String(text).trim()).filter(Boolean)
    }

    return (result.text ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  private resultText(result: PaddleOcrResult) {
    return this.resultTexts(result).join('\n')
  }

  private resultBoxes(result: PaddleOcrResult) {
    return (result.points ?? [])
      .map((points) => this.pointsToBbox(points))
      .filter((bbox): bbox is { x0: number; y0: number; x1: number; y1: number } => Boolean(bbox))
  }

  private pointsToBbox(points: unknown) {
    const flattenedPoints = this.flattenPoints(points)
    if (flattenedPoints.length === 0) return null

    return {
      x0: Math.min(...flattenedPoints.map((point) => point.x)),
      y0: Math.min(...flattenedPoints.map((point) => point.y)),
      x1: Math.max(...flattenedPoints.map((point) => point.x)),
      y1: Math.max(...flattenedPoints.map((point) => point.y)),
    }
  }

  private flattenPoints(value: unknown): Array<{ x: number; y: number }> {
    if (!Array.isArray(value)) {
      const point = this.asPoint(value)
      return point ? [point] : []
    }

    const directPoint = this.asPoint(value)
    if (directPoint) return [directPoint]

    return value.flatMap((item) => this.flattenPoints(item))
  }

  private asPoint(value: unknown): { x: number; y: number } | null {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      return { x: value[0], y: value[1] }
    }

    if (value && typeof value === 'object') {
      const point = value as PaddleOcrPoint
      if ('x' in point && 'y' in point && typeof point.x === 'number' && typeof point.y === 'number') {
        return { x: point.x, y: point.y }
      }
      if (0 in point && 1 in point && typeof point[0] === 'number' && typeof point[1] === 'number') {
        return { x: point[0], y: point[1] }
      }
    }

    return null
  }

  private clamp01(value: number) {
    return Math.min(Math.max(value, 0), 1)
  }

  async terminate(): Promise<void> {
    this.ocr = null
    this.loadingPromise = null
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export const textRecognitionService = new TextRecognitionService()
