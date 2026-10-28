import type { CanvasComment } from '../canvas/useCanvasComments'
import type { CanvasElement } from '../canvas/types'

// One instruction the user pinned on an image: WHERE on the image (relX/relY are
// 0..1 of its width/height) and WHAT to do there — the comment text becomes the
// per-point prompt, e.g. "thêm logo apple".
export type CommentPoint = {
  // 1-based badge shown on the canvas pin. Stable: it's the comment's position in
  // the full comment list, so the payload matches the number the user sees.
  number: number
  relX: number
  relY: number
  prompt: string
}

// One AI image-generation request: a source image plus every comment point placed
// on THAT image. The backend turns each request into exactly ONE new image that
// applies all of its points — so N commented images => N generated images.
export type CommentImageRequest = {
  // The canvas block the comments are anchored to (CanvasElement.id).
  elementId: string
  // The source image fed to the model alongside the prompts.
  imageUrl: string
  points: CommentPoint[]
}

type BuildOptions = {
  // Restrict the build to these comment ids — case 1: the single comment whose
  // input arrow was clicked. Omit to include every comment — case 2: "Apply" on the
  // floating menu. Badge numbers stay global either way.
  commentIds?: readonly string[]
}

// Group comments by their image and resolve each group to its source image URL:
// • Comments are bucketed per elementId, so a canvas with comments spread across 2
//   images yields 2 requests (1 per image) — each carrying only its own points.
// • `number` is the comment's GLOBAL 1-based position (matches the on-canvas pin),
//   not its index within the group, so it reads consistently in the payload.
// • Comments whose element was deleted, or whose element has no usable image URL
//   (e.g. a still-generating placeholder), are skipped — nothing to generate from.
// Requests come out in the order each image's FIRST comment appears.
export function buildCommentRequests(
  comments: readonly CanvasComment[],
  elements: ReadonlyArray<Pick<CanvasElement, 'id' | 'imageUrl'>>,
  options: BuildOptions = {},
): CommentImageRequest[] {
  const include = options.commentIds ? new Set(options.commentIds) : null
  const elementById = new Map(elements.map((el) => [el.id, el]))
  const requestByElement = new Map<string, CommentImageRequest>()

  comments.forEach((comment, index) => {
    if (include && !include.has(comment.id)) return

    const element = elementById.get(comment.elementId)
    if (!element || !element.imageUrl) return

    let request = requestByElement.get(comment.elementId)
    if (!request) {
      request = { elementId: comment.elementId, imageUrl: element.imageUrl, points: [] }
      requestByElement.set(comment.elementId, request)
    }

    request.points.push({
      number: index + 1,
      relX: comment.relX,
      relY: comment.relY,
      prompt: comment.value,
    })
  })

  return [...requestByElement.values()]
}
