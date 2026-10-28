import { DEFAULT_IMAGE_MODEL } from "../../shared/constants";
import type { StoryboardPreset } from "./types";

/** The node has no model picker, so the host owns the routing. */
export const STORYBOARD_IMAGE_MODEL = DEFAULT_IMAGE_MODEL;
export const STORYBOARD_FEATURE = "Storyboard";

// Picker ids are SENT to the host: each needs a prose entry below, or the builder snaps it away.
// Absolute CDP urls, used verbatim, so sample art renders the same against any backend.
const SAMPLES =
  "https://cdp-stg-core-api.cluega.com/media/artifact-files/019da56f-a02e-7985-9041-26818a8bf16a/2026/08";

/** Visual treatments, in picker order. Stills only — a grade is a look, not a motion. */
export const STORYBOARD_STYLE_PRESETS: StoryboardPreset[] = [
  { id: "grain", label: "Grain", thumbnail: `${SAMPLES}/01KYY2P6G8MFAX4FCXMMQ4H45D` },
  { id: "silver", label: "Silver", thumbnail: `${SAMPLES}/01KYY2P72YXADAVYCAX2801WR6` },
  { id: "golden", label: "Golden", thumbnail: `${SAMPLES}/01KYY2S3D6Q9D3BDFY1NJH1X9K` },
  { id: "arctic", label: "Arctic", thumbnail: `${SAMPLES}/01KYY2RSZE3F3ZYJPXVPYESFP8` },
  { id: "vivid", label: "Vivid", thumbnail: `${SAMPLES}/01KYY2VDYJSVN57NDF5H2QJ1WK` },
  { id: "monochrome", label: "Monochrome", thumbnail: `${SAMPLES}/01KYY2VC47BYB4GQG5A9GJXDQ3` },
  { id: "midnight", label: "Midnight", thumbnail: `${SAMPLES}/01KYY2X81YT4WXZ5QKNAT93J5Y` },
  { id: "symmetry", label: "Symmetry", thumbnail: `${SAMPLES}/01KYY2XDHR6EJE7FZ6XN50402D` },
  { id: "sunbaked", label: "Sunbaked", thumbnail: `${SAMPLES}/01KYY2YM22WR8A8REESEE7D4Q2` },
  { id: "dust", label: "Dust", thumbnail: `${SAMPLES}/01KYY2YYWZFWE1F3EV1BHNM24Z` },
  { id: "polished", label: "Polished", thumbnail: `${SAMPLES}/01KYY2ZMNHJXVAEPDCTE2AE8VS` },
  { id: "dread", label: "Dread", thumbnail: `${SAMPLES}/01KYY2ZZ7M2NP9B2AV1M44NCMF` },
  { id: "bleached", label: "Bleached", thumbnail: `${SAMPLES}/01KYY30W3C1CJ89T3XFAED3KZF` },
  { id: "graphic", label: "Graphic", thumbnail: `${SAMPLES}/01KYY30S526NGXM5GAS4VTJJ12` },
  { id: "neon", label: "Neon", thumbnail: `${SAMPLES}/01KYY36NV3GZ0F911X81J16X1T` },
  { id: "honey", label: "Honey", thumbnail: `${SAMPLES}/01KYY3AFRYYSZ8S6HNZG4266YG` },
  { id: "shadow", label: "Shadow", thumbnail: `${SAMPLES}/01KYY3897JKKJWZDMQ2NMT4NSS` },
  { id: "crystal", label: "Crystal", thumbnail: `${SAMPLES}/01KYY38K70JT1YM3ZZ2XE56XNS` },
  { id: "kodak", label: "Kodak", thumbnail: `${SAMPLES}/01KYY392NSDSDH2MY61R9TQ165` },
  { id: "mist", label: "Mist", thumbnail: `${SAMPLES}/01KYY39G5A2CTNCYZM13ZEYDFM` },
];

/** The still every movement rests on — and `none`'s whole tile. */
const BOARD_STILL = `${SAMPLES}/01KYXYVNGN74NKGGKDGNDZR04Y`;

/** Each movement carries a clip because a move only reads once it moves. */
export const STORYBOARD_CAMERA_MOVEMENT_PRESETS: StoryboardPreset[] = [
  { id: "none", label: "None", thumbnail: BOARD_STILL },
  {
    id: "eye_level",
    label: "Eye Level",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYXZ0SVSRV0WZNS1P1FK9TNJ`,
  },
  {
    id: "low_angle",
    label: "Low Angle",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYXZ5K8EZ0R59MN3CGWA3CGV`,
  },
  {
    id: "high_angle",
    label: "High Angle",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYXZBDG96ANNYXAM2CCCVVCN`,
  },
  {
    id: "birds_eye",
    label: "Bird's Eye",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYXZFT3545VKH0ZFJTCED3X8`,
  },
  {
    id: "worms_eye",
    label: "Worm's Eye",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYXZJW9K8CBAT1PCSPX6N8ZH`,
  },
  {
    id: "dutch_tilt",
    label: "Dutch Tilt",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYXZZ1D1C7T49W0HTGM6GESW`,
  },
  {
    id: "over_shoulder",
    label: "Over the Shoulder",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYY04AHJCSX0KXP6SHKQCHT8`,
  },
  {
    id: "point_of_view",
    label: "Point of View",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYY08DZ7WG6RCZF01HP5P263`,
  },
  {
    id: "two_shot",
    label: "Two Shot",
    thumbnail: BOARD_STILL,
    thumbnailVideo: `${SAMPLES}/01KYY0BXE4VMXCPXZT0KJ1RQAT`,
  },
];

// Mirrored, not imported: the DOM-only package loads lazily; drift is caught by `snap`.

export const PROGRESSIONS = ["slow", "medium", "fast"] as const;
export const RESOLUTIONS = ["1K", "2K", "4K"] as const;

export const STORYBOARD_DEFAULTS = {
  gridSize: "3x3",
  progression: "medium",
  resolution: "2K",
  storyboardStyle: "none",
} as const;

/** The editor drops this rather than sending it. */
export const CAMERA_MOVEMENT_NONE = "none";

/** POST /jobs `n` accepts 1–10. */
export const MAX_RUNS = 10;

/** A grid whose reduced ratio isn't here sends none rather than risking a 422. */
export const SUPPORTED_ASPECT_RATIOS = new Set([
  "1:1",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

/** The supported ratios as numbers, built once for `nearestSupportedRatio`. */
export const SUPPORTED_RATIO_SHAPES = [...SUPPORTED_ASPECT_RATIOS].map((ratio) => {
  const [width, height] = ratio.split(":").map(Number);
  // Log space, so 1:4 and 4:1 are equally far from 1:1; linear would snap every tall board to 4:5.
  return { ratio, shape: Math.log(width / height) };
});

/** `prose` is the grading instruction the model acts on. */
export const STYLE_PRESETS: Record<
  string,
  {
    label: string;
    prose: string;
  }
> = {
  none: {
    label: "None",
    prose:
      "neutral photographic color treatment with natural white balance, realistic saturation, balanced contrast and no additional stylistic color grading",
  },

  silver: {
    label: "Silver",
    prose:
      "cool silver-toned photographic grading with strongly reduced saturation, graphite-grey tones, soft silver highlights, neutral skin luminance and gentle classic-film contrast",
  },

  golden: {
    label: "Golden",
    prose:
      "warm golden photographic grading with amber highlights, honeyed midtones, softly warmed skin tones and gently warm shadows while preserving the original lighting direction and scene",
  },

  arctic: {
    label: "Arctic",
    prose:
      "cool arctic photographic grading with icy blue-white highlights, slightly reduced warm tones, crisp luminance, pale cool shadows and clean high-key tonal separation",
  },

  grain: {
    label: "Grain",
    prose:
      "desaturated photographic film treatment with pronounced organic film grain, smoky grey tonal separation, softened highlight roll-off and subtle analog texture while preserving realistic subjects and materials",
  },

  vivid: {
    label: "Vivid",
    prose:
      "rich photographic color grading with increased but realistic saturation, punchy primary colors, crisp contrast, clean deep shadows and bright controlled highlights without neon clipping or artificial illustration-like colors",
  },

  monochrome: {
    label: "Monochrome",
    prose:
      "true photographic black-and-white grading with zero chroma, strong tonal contrast, deep blacks, bright controlled highlights and detailed midtone separation",
  },

  midnight: {
    label: "Midnight",
    prose:
      "deep cool photographic grading dominated by navy, slate and blue-black tones, reduced overall luminance, dense shadows and restrained warm highlights while preserving the original scene and lighting structure",
  },

  symmetry: {
    label: "Symmetry",
    prose:
      "soft pastel photographic color grading using restrained powder pink, mint, cream and subtle warm-gold tonal accents with low-to-medium contrast; do not alter framing, geometry, camera position or composition",
  },

  sunbaked: {
    label: "Sunbaked",
    prose:
      "sun-faded photographic grading with muted sand, ochre and terracotta tones, slightly reduced saturation, warm highlights, softened contrast and gently lifted bright areas",
  },

  dust: {
    label: "Dust",
    prose:
      "warm earthy photographic grading with amber-brown midtones, slightly muted saturation, soft highlight diffusion and subtle warm haze in the tonal treatment without adding physical dust, particles or environmental effects",
  },

  polished: {
    label: "Polished",
    prose:
      "clean premium commercial photographic grading with neutral-to-cool whites, crisp contrast, controlled specular highlights, accurate material colors and a bright immaculate high-end finish",
  },

  dread: {
    label: "Dread",
    prose:
      "cold unsettling photographic grading with muted green-grey tones, reduced saturation, dense shadow detail and restrained contrast; do not add fog, blood, horror objects or new light sources",
  },

  bleached: {
    label: "Bleached",
    prose:
      "photographic bleach-bypass-inspired grading with reduced saturation, strong contrast, slightly warm neutral tones, dense blacks and bright compressed highlights while preserving realistic textures",
  },

  graphic: {
    label: "Graphic",
    prose:
      "bold photographic color grading with simplified color separation, strong saturation, pronounced contrast and clean graphic-looking tonal blocks while remaining fully photorealistic; never convert subjects into illustration, comic art, halftone art or flat drawing",
  },

  neon: {
    label: "Neon",
    prose:
      "high-chroma photographic grading emphasizing magenta, cyan, violet and electric-blue tones, deep neutral shadows and controlled colored highlight bloom without adding signage, lights or objects that are not present in the scene",
  },

  honey: {
    label: "Honey",
    prose:
      "soft warm photographic grading with creamy highlights, buttery amber midtones, natural warm skin tones, gentle contrast and subtle nostalgic warmth",
  },

  shadow: {
    label: "Shadow",
    prose:
      "low-key photographic tonal grading with deeper blacks, reduced shadow luminance, controlled highlights and subtle warm edge tones while preserving all existing subjects, visibility and original lighting geometry",
  },

  crystal: {
    label: "Crystal",
    prose:
      "clean crystalline photographic grading with cool blue-white highlights, high clarity, crisp micro-contrast, restrained saturation and subtle prismatic color separation only in existing bright highlights; do not create crystals, sparkles, facets or new reflective objects",
  },

  kodak: {
    label: "Kodak",
    prose:
      "vintage color-negative photographic grading with warm natural colors, slightly softened saturation, gentle highlight halation, fine organic grain and subtly lifted blacks",
  },

  mist: {
    label: "Mist",
    prose:
      "cool desaturated photographic grading with blue-green tonal bias, reduced contrast, softly lifted shadows and gentle highlight diffusion while preserving the actual atmosphere and geometry of the original scene",
  },
};

/** How far the story advances between panels. */
export const PROGRESSION_PROSE: Record<string, string> = {
  slow: "advance the story in small, incremental beats — consecutive panels stay close in time and space, changing mainly framing and a subtle shift in action",
  medium:
    "advance the story at a steady, even beat — each panel is a clear new moment, but the scene evolves continuously with no jarring jumps",
  fast: "advance the story in large jumps — each panel is a distinct beat of the narrative, covering more ground between panels while staying one story",
};

/** Keyed by the ids the node sends. */
export const CAMERA_MOVEMENT_PROSE: Record<
  string,
  { label: string; prose: string }
> = {
  eye_level: {
    label: "Eye Level",
    prose: "camera at the subject's eye height, neutral and observational",
  },
  low_angle: {
    label: "Low Angle",
    prose: "camera below the subject looking up, making it tower and dominate",
  },
  high_angle: {
    label: "High Angle",
    prose: "camera above the subject looking down, diminishing it in the frame",
  },
  birds_eye: {
    label: "Bird's Eye",
    prose: "camera far overhead looking straight down, a top-down layout of the scene",
  },
  worms_eye: {
    label: "Worm's Eye",
    prose: "camera at ground level looking steeply up, exaggerating height and scale",
  },
  dutch_tilt: {
    label: "Dutch Tilt",
    prose: "camera rolled off-axis so the horizon tilts, creating unease and energy",
  },
  over_shoulder: {
    label: "Over the Shoulder",
    prose:
      "framed from behind one subject's shoulder onto what they face, their shoulder soft in the foreground",
  },
  point_of_view: {
    label: "Point of View",
    prose: "the scene as the subject themselves sees it, first-person perspective",
  },
  two_shot: {
    label: "Two Shot",
    prose: "two subjects framed together in one balanced composition",
  },
};

/** POST /jobs carries no `resolution` field, so the target is stated in the prompt. */
export const RESOLUTION_PROSE: Record<string, string> = {
  "1K": "1K quality (roughly 1024 px on the board's long edge)",
  "2K": "2K quality (roughly 2048 px on the board's long edge)",
  "4K": "4K quality (roughly 4096 px on the board's long edge)",
};

export const STYLES_PREFIX = "appChat.flow.storyboard.styles";
export const CAMERA_MOVEMENTS_PREFIX = "appChat.flow.storyboard.cameraMovements";
