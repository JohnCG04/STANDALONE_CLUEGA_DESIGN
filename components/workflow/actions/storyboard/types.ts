/** Local mirror of the package's `StoryboardPreset`, which its published typings lack. */
export interface StoryboardPreset {
  /** The value sent to the host. Must exist in the prose tables in constants.ts. */
  id: string;
  label: string;
  /** Also the poster for `thumbnailVideo`. */
  thumbnail?: string;
  /** Played muted and looping while the cell is hovered or focused. */
  thumbnailVideo?: string;
}

/** A request folded to values every downstream step can trust. */
export interface NormalizedStoryboard {
  /** Trimmed; never empty (the caller guards). */
  prompt: string;
  /** Panel layout as sent, e.g. `"3x3"`. */
  gridSize: string;
  columns: number;
  rows: number;
  panels: number;
  progression: string;
  resolution: string;
  storyboardStyle: string;
  /** Absent for "None" and for any id not in the preset list. */
  cameraMovement?: string;
  /** In `Reference Image 1…N` port order. */
  referenceUrls: string[];
  /** How many whole boards → the job's `n`. Absent means one. */
  runs?: number;
  aspectRatio: string;
  panelAspectRatio: string;
}

export type Translate = (path: string) => string;
