declare module '@paddlejs-models/ocr' {
  export function init(): Promise<void>
  export function recognize(
    image: HTMLImageElement | HTMLCanvasElement,
    options?: {
      canvas?: HTMLCanvasElement
      style?: Record<string, unknown>
    },
  ): Promise<{
    text?: string | string[]
    points?: unknown[]
    confidence?: number
  }>
  export function detect(image: HTMLImageElement | HTMLCanvasElement): Promise<unknown[]>
}
