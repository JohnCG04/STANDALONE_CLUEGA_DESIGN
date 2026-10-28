export interface Face {
  family: string;
  weight: number;
  italic: boolean;
}

/** Response of `POST /image-projects/clone/preview`. No media is rendered. */
export type ClonePreviewResult = {
  recipe?: unknown;
  prompt: string;
  style_tags?: string[];
  negative_tags?: string[];
  product?: string;
  seed_artifact_id?: string | null;
};

export type VoiceSampleWire = {
  id?: string;
  name?: string;
  /** A path under the media API (`/models/audio/voices/<family>/<voice>/sample`), or null. */
  sample_url?: string | null;
};

/** What media-ai serves for the design_layers operation (snake_case, artifact urls). */
export type Box = { x: number; y: number; w: number; h: number };
export type ServedLine = { text: string; box: Box; size: number; tracking: number; x_scale: number };
export type ServedPiece = {
  id: string;
  kind: "image" | "text";
  z: number;
  url: string;
  box: Box;
  text?: string;
  lines?: ServedLine[];
  font?: { family: string; weight: number; italic: boolean };
  colour?: string;
  align?: "left" | "center" | "right";
  line_height?: number;
};
export type ServedDesign = { width: number; height: number; pieces: ServedPiece[] };
