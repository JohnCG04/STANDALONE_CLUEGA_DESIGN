import { create } from "zustand";

// Minimal app-wide toast queue (no external dependency). Push from anywhere —
// including non-React code — and render once via <ToastViewport />.

export type ToastTone = "error" | "info";

/** One button on a toast. `onClick` runs inside the click itself, so it may
 *  open a browser prompt that needs the user's activation. */
export type ToastAction = { label: string; onClick: () => void };

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /**
   * The channel this toast speaks on, when it has one. A push carrying a key
   * REPLACES the standing toast on that key — latest wins.
   *
   * For one control flipped repeatedly. Stacking is right for unrelated events
   * and wrong here: three quick flips of the same switch would otherwise leave
   * three toasts up for four seconds, disagreeing about where it ended up.
   */
  key?: string;
};

export type PushOptions = {
  /** See Toast.key. Omit to stack, which stays the default. */
  key?: string;
  /**
   * How long this toast stays up, when the default is not long enough.
   *
   * Four seconds suits a receipt — "saved", "removed" — because the reader
   * already knows what it will say and is only checking that it happened. It is
   * not enough for a sentence they have not read before: at ordinary reading
   * speed a twenty-word message is still being read when it disappears, and a
   * message nobody finishes is the same as no message.
   *
   * Every toast carries a dismiss control and `info` announces politely, so a
   * longer one costs the reader nothing.
   */
  durationMs?: number;
  /** A single action button; the toast is dismissed after it runs. */
  action?: ToastAction;
};

const AUTO_DISMISS_MS = 4000;

let idCounter = 0;

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone, options?: PushOptions) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  push: (message, tone = "error", options) => {
    idCounter += 1;
    const id = `toast_${Date.now()}_${idCounter}`;
    const key = options?.key;
    set((state) => ({
      toasts: [
        // Drop the standing toast on this channel, if any. A NEW id rather than
        // reusing the old one: the first push's dismiss timer is still pending
        // and filters by id, so reuse would have it cut the replacement short —
        // sooner the faster the user flips.
        ...(key ? state.toasts.filter((toast) => toast.key !== key) : state.toasts),
        { id, message, tone, key, ...(options?.action ? { action: options.action } : {}) },
      ],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, options?.durationMs ?? AUTO_DISMISS_MS);
  },

  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));
