import {
  EXPAND_PROMPT_BASE,
  MIN_EXPAND_BAND,
  SEAM_LIMIT,
} from '@/components/workflow/actions/resizeImage/constants'
import {
  buildExpandCanvas,
  canvasToPhotoBlob,
  canvasToPngBlob,
  compositeOriginalBack,
  createCanvas,
  photoFileExtension,
} from '@/components/workflow/actions/resizeImage/expandCanvas'
import {
  measureSeamDiscontinuity,
  verifyExpandCanvas,
} from '@/components/workflow/actions/resizeImage/expandVerify'
import {
  containSourceInFrame,
  resolveExpandGeometry,
} from '@/components/workflow/actions/resizeImage/helpers'
import { loadPixelSource } from '@/components/workflow/actions/resizeImage/pixelSource'
import type { SeamReport } from '@/components/workflow/actions/resizeImage/types'
import type { SocialMediaSize } from './mediaImageClient'

/**
 * Reframe an image onto a SOCIAL PLACEMENT — the AI Resize engine
 * (components/workflow/actions/resizeImage) driven by a fixed frame instead of a bare ratio.
 *
 * The two features were solving the same problem in different ways, and only one of
 * them worked. AI Resize hands the model a canvas whose new area is TRANSPARENT (the
 * alpha channel is the instruction), then pastes the original back over the answer, so
 * the subject cannot drift and the frame is exact by construction. Social Generate used
 * to hand over an opaque canvas whose margins were a BLURRED COPY of the picture and
 * ask, in prose, for the margins to be repainted and the size preserved — two things a
 * model reads as suggestions. It answered with a sharpened blur, a duplicated subject,
 * or a 1024×1024 picture for a 1080×1920 slot.
 *
 * So this path is now the resize path, plus the one thing a placement adds: the canvas
 * is an EXACT pixel size, so the source is fitted INTO the frame rather than the frame
 * grown around it (`fitSource`), and the composite step re-frames whatever the provider
 * returns back onto that exact canvas.
 */

/** Run the image job for a prepared canvas and resolve the generated image's url. */
export type SocialOutpaintJob = (inputFileUrl: string) => Promise<string>

export interface SocialOutpaintParams {
  sourceImageUrl: string
  targetSize: SocialMediaSize
  /** Store the prepared canvas and return a url the backend can fetch. */
  uploadPng: (file: File) => Promise<string | null>
  generate: SocialOutpaintJob
}

export interface SocialOutpaintResult {
  /** Always exactly `targetSize.width × targetSize.height`. */
  blob: Blob
  fileName: string
  /** False when the source already filled the frame and no job was run. */
  painted: boolean
  /** Only measured on a painted result. */
  seam: SeamReport | null
}

export const SOCIAL_OUTPAINT_MESSAGES = {
  canvasUploadFailed:
    'Could not upload the reframed canvas for this social size, so no image was generated.',
  resultUploadFailed:
    'The social size was generated but could not be saved to your media library.',
  noResult: 'The social size job returned no image.',
} as const

/**
 * Ad platforms reject a frame, not a caption, so the geometry contract is stated where
 * the model can act on it and nowhere else — the canvas already IS the frame, exactly
 * as in AI Resize. The base prompt does the heavy lifting (extend the background, never
 * echo the subject, never re-crop); this only adds the placement context and the safe
 * area, which is the one instruction a bare outpaint has no way to infer.
 */
export function buildSocialOutpaintPrompt(
  targetSize: SocialMediaSize,
  userPrompt?: string,
): string {
  const parts = [
    EXPAND_PROMPT_BASE,
    `This canvas is a ${targetSize.ratio} ${targetSize.platform} ad placement ` +
      `(${targetSize.width} x ${targetSize.height} pixels). Keep the extended area free ` +
      `of anything that must stay readable: no subject, product, logo or text may end up ` +
      `against the extreme edges, where a platform's UI overlays sit.`,
  ]
  const extra = userPrompt?.trim()
  if (extra) parts.push(extra)
  return parts.join('\n\n')
}

/**
 * Reframe to the placement. Returns a finished picture at exactly the target size —
 * whether or not the model behaved, and whether or not a job was needed at all.
 */
export async function runSocialOutpaint(
  params: SocialOutpaintParams,
): Promise<SocialOutpaintResult> {
  const { sourceImageUrl, targetSize, uploadPng, generate } = params
  const target = { width: targetSize.width, height: targetSize.height }

  // The strict loader, not the canvas one: this reads pixels back (encode, verify,
  // paste-back, seam scan), and a tainted bitmap fails LATE — after the job is paid for.
  const source = await loadPixelSource(sourceImageUrl)

  try {
    const natural = {
      width: source.image.naturalWidth,
      height: source.image.naturalHeight,
    }
    const drawn = containSourceInFrame(natural, target.width, target.height)

    // Already the right frame (a 1:1 source into a 1:1 placement, the common re-run).
    // An outpaint here would bill a job to paint a band under 8px — resize treats that
    // as an error because a ratio change is the whole request; a placement just wants
    // the file at the right size, which a plain draw already gives.
    if (
      target.width - drawn.width < MIN_EXPAND_BAND &&
      target.height - drawn.height < MIN_EXPAND_BAND
    ) {
      const blob = await canvasToPhotoBlob(drawExactFrame(source.image, target))
      return { blob, fileName: fileNameFor(targetSize, blob), painted: false, seam: null }
    }

    const geometry = resolveExpandGeometry(natural, {
      canvasWidth: target.width,
      canvasHeight: target.height,
      // The placement is the spec: fit the source into it, never grow past it.
      fitSource: true,
      // ONE file, new area transparent — what an image-edit model with no mask
      // parameter reads. A second mask raster would need a second input_files entry.
      fill: 'alpha',
    })

    const { canvas } = buildExpandCanvas(source.image, geometry)
    const canvasBlob = await canvasToPngBlob(canvas)
    // Catches the one failure the prompt cannot: a PNG encode that dropped alpha hands
    // the model an opaque plate and licenses it to repaint the whole frame.
    await verifyExpandCanvas(canvasBlob, geometry)

    const inputFile = await uploadPng(
      new File([canvasBlob], 'social-canvas.png', { type: 'image/png' }),
    )
    if (!inputFile) throw new Error(SOCIAL_OUTPAINT_MESSAGES.canvasUploadFailed)

    const paintOnce = async () => {
      const generatedUrl = await generate(inputFile)
      if (!generatedUrl) throw new Error(SOCIAL_OUTPAINT_MESSAGES.noResult)

      const painted = await loadPixelSource(generatedUrl)
      try {
        // THE SIZE GUARANTEE, and it is structural rather than hopeful: the answer is
        // drawn onto a canvas that is already the placement, so a provider that
        // normalized to 1024² still lands at 1080×1920 — with the original pasted back
        // sharp and in position on top of it.
        const composited = compositeOriginalBack(
          painted.image,
          source.image,
          geometry,
        )
        return {
          canvas: composited,
          seam: measureSeamDiscontinuity(composited, geometry),
        }
      }
      finally {
        painted.release()
      }
    }

    // A model that re-imagined the frame leaves a visible step around the paste-back.
    // The failure is stochastic, so it gets ONE re-roll and the better draw is kept.
    let best = await paintOnce()
    if (best.seam.score > SEAM_LIMIT) {
      const rerolled = await paintOnce()
      if (rerolled.seam.score < best.seam.score) best = rerolled
    }
    if (best.seam.score > SEAM_LIMIT) {
      // A picture the user can look at and re-run beats two paid jobs and an error.
      console.warn(
        `[SocialGenerate] visible seam on the ${best.seam.side} edge after a re-roll `
        + `(${best.seam.score.toFixed(1)}× the picture's own texture variation).`,
      )
    }

    // A PHOTO, not PNG: no transparency left to carry, and PNG is ~10× heavier.
    const blob = await canvasToPhotoBlob(best.canvas)
    return { blob, fileName: fileNameFor(targetSize, blob), painted: true, seam: best.seam }
  }
  finally {
    source.release()
  }
}

/**
 * No backend configured (dev): still answer at the exact size, just without the AI step.
 * A blurred cover-scaled copy fills the margins — the wrong input to hand a model, but
 * a reasonable thing to LOOK at when no model is going to run.
 */
export async function renderSocialFallback(
  sourceImageUrl: string,
  targetSize: SocialMediaSize,
): Promise<string> {
  const source = await loadPixelSource(sourceImageUrl)
  try {
    const canvas = createCanvas(targetSize.width, targetSize.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return sourceImageUrl

    const image = source.image
    const iw = image.naturalWidth
    const ih = image.naturalHeight

    const cover = Math.max(targetSize.width / iw, targetSize.height / ih)
    ctx.filter = 'blur(28px)'
    ctx.drawImage(
      image,
      (targetSize.width - iw * cover) / 2,
      (targetSize.height - ih * cover) / 2,
      iw * cover,
      ih * cover,
    )
    ctx.filter = 'none'

    const drawn = containSourceInFrame({ width: iw, height: ih }, targetSize.width, targetSize.height)
    ctx.drawImage(
      image,
      (targetSize.width - drawn.width) / 2,
      (targetSize.height - drawn.height) / 2,
      drawn.width,
      drawn.height,
    )

    return canvas.toDataURL('image/png')
  }
  finally {
    source.release()
  }
}

/**
 * The no-op path's draw. Stretched to the full frame rather than centered: the gap is
 * under {@link MIN_EXPAND_BAND} on both axes by the time we get here, so this is a
 * sub-1% resample — where centering would leave a transparent sliver down two edges.
 */
function drawExactFrame(
  image: CanvasImageSource,
  target: { width: number; height: number },
): HTMLCanvasElement {
  const canvas = createCanvas(target.width, target.height)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, target.width, target.height)
  }
  return canvas
}

function fileNameFor(targetSize: SocialMediaSize, blob: Blob): string {
  return `${targetSize.id}-${targetSize.width}x${targetSize.height}.${photoFileExtension(blob)}`
}
