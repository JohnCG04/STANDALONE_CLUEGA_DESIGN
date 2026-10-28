import type {
  BlendMode,
  LogoPlacement,
  LogoPosition,
  ObjectRect,
  PlaceRelativeTo,
} from "@dogclaw-ad/workflow";

/** The batch folded to concrete values — the prompt's only input. */
export interface NormalizedLogoComposite {
  /** In the order the node lists them. Already un-proxied. */
  creativeUrls: string[];
  /** The editor's subject rect per creative, aligned index-for-index. */
  objectBoxes: (ObjectRect | null)[];
  logoUrl: string;
  /** What the anchors, `size` and `margin` are measured against. */
  placeRelativeTo: PlaceRelativeTo;
  position: LogoPosition;
  /** Width as a percentage of the ANCHOR BOX's width, 1..100. */
  size: number;
  opacity: number;
  /** Edge gap as a percentage of the box's width. Ignored on a centered axis. */
  margin: number;
  blendMode: BlendMode;
  avoidContent: boolean;
  preserveOriginal: boolean;
  /** AI prints the mark onto the surface (may redraw it); off = the exact canvas composite. */
  printOnSurface: boolean;
  /** The same placement as ratios — what the geometry is built on. */
  placement: LogoPlacement;
}

/** The finished placement for ONE creative. */
export interface LogoCompositeGeometry {
  /** The anchor box, in fractions of the creative. */
  box: ObjectRect;
  /** True when `box` is a measured subject rect rather than the whole frame. */
  anchoredToObject: boolean;
  /** Where the MARK lands; only when frame AND logo aspect were measured (half a rect is worse). */
  rect?: ObjectRect;
  /** `rect` in source pixels. Present whenever `rect` is. */
  pixels?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  /** The creative's pixel size, when it was measured. */
  frame?: ImageFrame;
  /** The logo file's own measurements, when they were taken. */
  artwork?: LogoArtwork;
}

/** Natural pixel size of an image. */
export interface ImageFrame {
  width: number;
  height: number;
}

/** A logo file plus where its actual mark lives inside that file. */
export interface LogoArtwork extends ImageFrame {
  /** Tight box of the OPAQUE pixels, as 0..1 fractions. Full frame when unreadable. */
  content: ObjectRect;
  /** The file carries transparent padding the model must not count as the mark. */
  trimmed: boolean;
  /** The mark's own width ÷ height, measured on `content`. Never 0. */
  aspectRatio: number;
  /** Decides whether a background-removal pass is needed. `null` means UNKNOWN. */
  hasAlpha: boolean | null;
}
