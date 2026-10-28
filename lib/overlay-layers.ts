/**
 * The global overlay hierarchy, in one place.
 *
 * Every panel that leaves the document flow competes for the same axis, and
 * until this file the numbers were picked per component. That is how the
 * cookie notice (`z-80`) ended up above every dialog built on the shared
 * primitive (`z-50`): a modal opened underneath a non-blocking banner, and the
 * banner — a real element with pointer events — swallowed clicks over the part
 * of the modal it covered.
 *
 * The rule the numbers encode:
 *
 * ```
 * page content            z-0  … z-40   in-flow, sticky headers, section chrome
 * consent notice          z-45          non-blocking; must never cover a modal
 * floating UI             z-50          popovers, selects, tooltips (anchored)
 * modal / dialog          z-50          shared Dialog overlay + content
 * critical system overlay z-100         toasts: always visible, even over a modal
 * consent preference      z-130 / 135   user-invoked BLOCKING consent dialog
 * ```
 *
 * Two deliberate decisions:
 *
 * 1. The consent *notice* sits BELOW the modal layer, not above it. It is
 *    informational and dismissable, so being dimmed behind a modal's scrim for
 *    the life of that modal costs nothing — and it is the only ordering in which
 *    a modal is guaranteed to be interactable. It stays fully usable the moment
 *    the modal closes.
 * 2. The consent *preference center* sits ABOVE the modal layer. It is itself a
 *    blocking dialog with its own scrim and focus handling, and it only opens
 *    because the user asked for it, so whatever it covers is not what the user
 *    is currently acting on.
 *
 * Floating UI shares the modal number rather than sitting above it because both
 * portal to `<body>`: a popover opened from inside a dialog mounts after it and
 * wins on DOM order. Giving the dialog a higher number would put every select
 * and popover inside a dialog behind it.
 *
 * Adding a new overlay means adding it here first. A bare `z-[9999]` in a
 * component is how this problem started.
 */
export const OVERLAY_LAYER = {
  /** Non-blocking cookie notice card. Below the modal layer, on purpose. */
  consentNotice: "z-[45]",
  /** Scrim of the user-invoked blocking consent dialog. */
  consentCenterScrim: "z-[130]",
  /** Panel of the user-invoked blocking consent dialog. */
  consentCenterPanel: "z-[135]",
} as const;
