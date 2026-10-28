export const LOGO_COMPOSITE_MESSAGES = {
  noCreatives: "Logo Compositing received no creatives.",
  noLogo: "Logo Compositing received no logo image.",
  unmeasurable: "Logo Compositing could not measure the logo or the creative.",
  noCanvas: "Logo Compositing needs a browser canvas, and none is available.",
} as const;

export const LOGO_COMPOSITE_WARNINGS = {
  cutOutFailed: "[workflow] logo cut-out failed; using the raw logo.",
  capped: (max: number, wired: number) =>
    `[workflow] logo composite capped at ${max} creatives (${wired} were wired).`,
} as const;
