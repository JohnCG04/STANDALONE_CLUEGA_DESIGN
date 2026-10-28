import { create } from 'zustand'
import { produce } from 'immer'

const MAX_COMMENT_HISTORY = 50

// Keep a relative coordinate inside its block (0..1). Clicks just outside the box
// edge clamp to the border instead of escaping the image.
const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

// One comment pinned to a canvas block. The position is stored RELATIVE to the
// block (0..1 across its width/height) — NOT in absolute canvas pixels — so the pin
// tracks the image through drag / resize / zoom; the on-screen point is derived at
// render time from the element's current geometry + viewport. The display number
// (the "1", "2" badge) is intentionally NOT stored: it's the comment's 1-based
// position in `comments`, so removing one renumbers the rest for free.
export type CanvasComment = {
  id: string
  // The canvas block (CanvasElement.id) this comment is anchored to.
  elementId: string
  relX: number
  relY: number
  value: string
}

// The comment currently bound to the open input box. `isNew` separates a freshly
// clicked spot (not yet in `comments`) from re-opening an existing comment for edit.
export type CommentDraft = {
  id: string
  elementId: string
  relX: number
  relY: number
  value: string
  isNew: boolean
}

type CanvasCommentsState = {
  // The committed comments, in creation order (index + 1 = the badge number).
  comments: CanvasComment[]
  // The comment being typed/edited right now (drives the input box), or null.
  draft: CommentDraft | null
  // Undo/redo history of `comments` ONLY — deliberately separate from the canvas
  // history so the comment toolbar's undo/redo add/remove bubbles without ever
  // touching images, layout, or filters.
  history: CanvasComment[][]
  historyIndex: number

  // Open a fresh input box at a spot on a block. Commits any open draft first so
  // clicking a new position always banks the previous one (requirement 4).
  openDraftAt: (elementId: string, relX: number, relY: number) => void
  // Re-open an existing comment for editing, pre-filled with its saved text
  // (requirement 3). Commits any open draft first.
  editComment: (id: string) => void
  // Live-update the open draft's text as the user types (requirement 2).
  setDraftValue: (value: string) => void
  // Persist the open draft: upsert it when it has text, or drop it (and any
  // existing comment it maps to) when emptied. Fired on blur / Enter / outside
  // click — this is what bumps the toolbar count (requirement 4).
  commitDraft: () => void
  // Abandon the open draft without persisting (Escape); existing comments untouched.
  cancelDraft: () => void
  removeComment: (id: string) => void
  // Drop every comment in one step (the toolbar "Discard"). Undoable, unlike
  // `reset` — the user can recover an accidental discard via the comment undo.
  clearAll: () => void
  // Step backward/forward through the comment-only history (toolbar undo/redo).
  undo: () => void
  redo: () => void
  // Wipe all comment state + history. Called when the canvas switches sessions, and
  // meant to be called by the future prompt-submit flow once comments are consumed.
  reset: () => void
}

// Snapshot the current comments onto the history stack, dropping any redo branch and
// capping the stack. A clone per comment keeps snapshots immutable across edits.
function pushHistory(state: CanvasCommentsState) {
  const snapshot = state.comments.map((comment) => ({ ...comment }))
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(snapshot)
  if (newHistory.length > MAX_COMMENT_HISTORY) newHistory.shift()
  state.history = newHistory
  state.historyIndex = newHistory.length - 1
}

export const useCanvasComments = create<CanvasCommentsState>((set, get) => ({
  comments: [],
  draft: null,
  history: [[]],
  historyIndex: 0,

  openDraftAt: (elementId, relX, relY) => {
    get().commitDraft()
    set(
      produce((state: CanvasCommentsState) => {
        state.draft = {
          id: crypto.randomUUID(),
          elementId,
          relX: clampUnit(relX),
          relY: clampUnit(relY),
          value: '',
          isNew: true,
        }
      }),
    )
  },

  editComment: (id) => {
    get().commitDraft()
    set(
      produce((state: CanvasCommentsState) => {
        const comment = state.comments.find((c) => c.id === id)
        if (!comment) return
        state.draft = { ...comment, isNew: false }
      }),
    )
  },

  setDraftValue: (value) =>
    set(
      produce((state: CanvasCommentsState) => {
        if (state.draft) state.draft.value = value
      }),
    ),

  commitDraft: () =>
    set(
      produce((state: CanvasCommentsState) => {
        const draft = state.draft
        if (!draft) return
        state.draft = null

        const value = draft.value.trim()
        const existingIndex = state.comments.findIndex((c) => c.id === draft.id)

        // Empty text never persists: drop the comment if it already existed (the
        // user cleared it), otherwise simply discard the new draft.
        if (!value) {
          if (existingIndex !== -1) {
            state.comments.splice(existingIndex, 1)
            pushHistory(state)
          }
          return
        }

        const comment: CanvasComment = {
          id: draft.id,
          elementId: draft.elementId,
          relX: draft.relX,
          relY: draft.relY,
          value,
        }
        if (existingIndex !== -1) {
          // Editing an existing comment is only an undo step when the text changed.
          if (state.comments[existingIndex].value !== value) {
            state.comments[existingIndex] = comment
            pushHistory(state)
          }
        } else {
          state.comments.push(comment)
          pushHistory(state)
        }
      }),
    ),

  cancelDraft: () =>
    set(
      produce((state: CanvasCommentsState) => {
        state.draft = null
      }),
    ),

  removeComment: (id) =>
    set(
      produce((state: CanvasCommentsState) => {
        const before = state.comments.length
        state.comments = state.comments.filter((c) => c.id !== id)
        if (state.draft?.id === id) state.draft = null
        if (state.comments.length !== before) pushHistory(state)
      }),
    ),

  clearAll: () =>
    set(
      produce((state: CanvasCommentsState) => {
        state.draft = null
        if (state.comments.length === 0) return
        state.comments = []
        pushHistory(state)
      }),
    ),

  undo: () =>
    set(
      produce((state: CanvasCommentsState) => {
        if (state.historyIndex <= 0) return
        state.historyIndex -= 1
        state.comments = state.history[state.historyIndex].map((c) => ({ ...c }))
        state.draft = null
      }),
    ),

  redo: () =>
    set(
      produce((state: CanvasCommentsState) => {
        if (state.historyIndex >= state.history.length - 1) return
        state.historyIndex += 1
        state.comments = state.history[state.historyIndex].map((c) => ({ ...c }))
        state.draft = null
      }),
    ),

  reset: () => set({ comments: [], draft: null, history: [[]], historyIndex: 0 }),
}))
