import { STORYBOARD_GRID_SIZES, type StoryboardRequest } from "@dogclaw-ad/workflow";
import {
  CAMERA_MOVEMENT_NONE,
  CAMERA_MOVEMENT_PROSE,
  MAX_RUNS,
  PROGRESSION_PROSE,
  PROGRESSIONS,
  RESOLUTION_PROSE,
  RESOLUTIONS,
  STORYBOARD_DEFAULTS,
  STYLE_PRESETS,
  SUPPORTED_ASPECT_RATIOS,
  SUPPORTED_RATIO_SHAPES,
} from "./constants";
import type { NormalizedStoryboard } from "./types";

/** Snap to a known vocabulary, falling back to the node's default. */
function snap<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const trimmed = value?.trim();
  return trimmed && (allowed as readonly string[]).includes(trimmed)
    ? (trimmed as T)
    : fallback;
}

/** The fallback only covers a malformed mirror. */
function parseGrid(gridSize: string): { columns: number; rows: number } {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(gridSize);
  if (!match) return { columns: 3, rows: 3 };
  return { columns: Number(match[1]), rows: Number(match[2]) };
}

/** The closest ratio POST /jobs accepts: no ratio means a square default, which reflows a tall
 *  board into 2x2, so the nearest legal canvas still reads clearly tall or wide. */
function nearestSupportedRatio(width: number, height: number): string {
  if (!width || !height) return "1:1";
  const target = Math.log(width / height);
  let best = SUPPORTED_RATIO_SHAPES[0];
  for (const candidate of SUPPORTED_RATIO_SHAPES) {
    if (Math.abs(candidate.shape - target) < Math.abs(best.shape - target)) {
      best = candidate;
    }
  }
  return best.ratio;
}

/** A cell's own framing: the request's ratio when the API knows it, else square. */
function panelAspectRatio(picked: string | undefined): string {
  const trimmed = picked?.trim();
  return trimmed && SUPPORTED_ASPECT_RATIOS.has(trimmed) ? trimmed : "1:1";
}

/** The GRID owns the canvas and the request ratio is ONE PANEL's shape: `C·w : R·h`, snapped.
 *  A canvas contradicting the grid gets reflowed, whatever the prompt says. */
function boardAspectRatio(
  panelRatio: string,
  columns: number,
  rows: number,
): string {
  const [panelWidth, panelHeight] = panelRatio.split(":").map(Number);
  return nearestSupportedRatio(columns * panelWidth, rows * panelHeight);
}

/** `params` is free-form, so anything that isn't a count above 1 means one board. */
function normalizeRuns(value: unknown): number | undefined {
  const runs = Math.floor(Number(value));
  if (!Number.isFinite(runs) || runs <= 1) return undefined;
  return Math.min(runs, MAX_RUNS);
}

/** Re-snaps ids the editor already snapped: a public action, and an unknown id renders an empty
 *  instruction. Urls must arrive un-proxied. */
export function normalizeStoryboardRequest(
  req: StoryboardRequest,
): NormalizedStoryboard {
  const gridSize = snap(req.gridSize, STORYBOARD_GRID_SIZES, STORYBOARD_DEFAULTS.gridSize);
  const { columns, rows } = parseGrid(gridSize);

  const panel = panelAspectRatio(req.aspectRatio);

  const cameraMovement = req.cameraMovement?.trim();
  const hasCamera =
    !!cameraMovement &&
    cameraMovement !== CAMERA_MOVEMENT_NONE &&
    cameraMovement in CAMERA_MOVEMENT_PROSE;

  return {
    prompt: req.prompt?.trim() ?? "",
    gridSize,
    columns,
    rows,
    panels: columns * rows,
    progression: snap(req.progression, PROGRESSIONS, STORYBOARD_DEFAULTS.progression),
    resolution: snap(req.resolution, RESOLUTIONS, STORYBOARD_DEFAULTS.resolution),
    storyboardStyle:
      req.storyboardStyle?.trim() &&
        req.storyboardStyle.trim() in STYLE_PRESETS
        ? req.storyboardStyle.trim()
        : STORYBOARD_DEFAULTS.storyboardStyle,
    ...(hasCamera ? { cameraMovement } : {}),
    // Port order matters — the prompt calls them "Reference 1…N".
    referenceUrls: (req.references ?? [])
      .map((reference: any) => reference?.url?.trim())
      .filter((url: any): url is string => !!url),
    runs: normalizeRuns(req.params?.runs),
    panelAspectRatio: panel,
    aspectRatio: boardAspectRatio(panel, columns, rows),
  };
}

function spokenRatio(ratio: string): string {
  return ratio === "1:1" ? "1 by 1" : ratio;
}

export function buildStoryboardPrompt(board: NormalizedStoryboard): string {
  const style = STYLE_PRESETS[board.storyboardStyle];

  const camera = board.cameraMovement
    ? CAMERA_MOVEMENT_PROSE[board.cameraMovement]
    : undefined;

  const panelWord = board.panels === 1 ? "panel" : "panels";

  // Columns + rows + orientation stated outright: "3 x 1" alone is ambiguous.
  const gridDirection =
    board.rows === 1
      ? `ONE horizontal row containing exactly ${board.columns} columns`
      : board.columns === 1
        ? `ONE vertical column containing exactly ${board.rows} rows`
        : `exactly ${board.rows} rows and exactly ${board.columns} columns`;

  // Names the canvas `boardAspectRatio` already shaped, so the model has nothing to reconcile.
  const orientation =
    board.columns > board.rows
      ? "LANDSCAPE (wider than it is tall)"
      : board.columns < board.rows
        ? "PORTRAIT (taller than it is wide)"
        : "SQUARE";

  // A row-by-row manifest is reproduced or visibly not; "3 rows and 2 columns" is met loosely.
  const rowManifest = Array.from({ length: board.rows }, (_, index) => {
    const first = index * board.columns + 1;
    const last = first + board.columns - 1;
    const cells =
      board.columns === 1
        ? `panel ${first}`
        : `panels ${first} to ${last}, left to right`;
    return `- Row ${index + 1} contains exactly ${board.columns} ${board.columns === 1 ? "panel" : "panels"
      }: ${cells}.`;
  }).join("\n");

  const role = [
    "[ROLE]",
    "You are an expert cinematic commercial storyboard artist.",
    "",
    "Create a sequence of frames from ONE continuous commercial video shoot.",
    "Treat every panel as a different frame captured from one and the same physical world.",
    "",
    "Continuity is mandatory:",
    "- same people",
    "- same facial identity",
    "- same body appearance",
    "- same wardrobe",
    "- same product",
    "- same environment",
    "- same materials",
    "- same time of day",
    "- same lighting setup",
    "- same visual medium",
    "",
    "Only camera framing, camera position, pose, action and expression may evolve between panels.",
  ].join("\n");

  const gridSpec = [
    "[STRICT GRID STRUCTURE]",
    "",
    `The final output MUST contain EXACTLY ${board.panels} ${panelWord}.`,
    `Grid dimensions are EXACTLY: ${board.columns} COLUMNS × ${board.rows} ROWS.`,
    `This means: ${gridDirection}.`,
    "",
    `COLUMN COUNT = ${board.columns}.`,
    `ROW COUNT = ${board.rows}.`,
    `TOTAL PANEL COUNT = ${board.panels}.`,
    "",
    "These numbers are hard constraints and must not be interpreted creatively.",
    "",
    `The output canvas is ${orientation} at approximately ${spokenRatio(board.aspectRatio)}.`,
    `The canvas was chosen to fit THIS grid: ${board.columns} × ${board.rows} cells of roughly ${spokenRatio(board.panelAspectRatio)} each.`,
    "The grid is never re-flowed to suit the canvas — the canvas already suits the grid.",
    "",
    "Row by row, the board is exactly:",
    rowManifest,
    "",
    "DO NOT:",
    `- rearrange the ${board.panels} ${panelWord} into any other number of rows or columns`,
    "- balance the layout to fill the frame differently",
    "- fall back to a square or 2x2 arrangement",
    "- add extra panels",
    "- remove panels",
    "- merge panels",
    "- create irregular panel sizes",
    "- create nested panels",
    "- create inset images",
    "- create split-screen panels",
    "- create floating images",
    "- create overlapping frames",
    "- create a contact sheet with a different layout",
    "- change the requested number of rows",
    "- change the requested number of columns",
    "",
    "All panel cells must have equal width and equal height.",
    "Panels must align perfectly to the requested rectangular grid.",
    "Use thin, uniform gutters between adjacent cells.",
    "",
    "The storyboard grid itself fills the final image.",
    "Do not render the storyboard on paper, a monitor, a wall, a desk or inside another scene.",
  ].join("\n");

  const orderSpec = [
    "[PANEL ORDER]",
    "",
    "Story progression follows standard reading order:",
    "LEFT TO RIGHT across each row, then continue to the next row from LEFT TO RIGHT.",
    "",
    `There are exactly ${board.panels} sequential story beats.`,
    "Each cell represents exactly ONE story beat.",
    "Never place multiple moments inside a single cell.",
  ].join("\n");

  const outputSpec = [
    "[OUTPUT SPECIFICATION]",
    "",
    "Return ONE single final image containing the complete storyboard grid.",
    `Render at ${RESOLUTION_PROSE[board.resolution]}.`,
    "",
    "Every panel must be:",
    "- fully composed",
    "- sharp",
    "- in focus",
    "- visually readable",
    "- free of accidental cropping of the primary subject",
    "- consistent with all surrounding panels",
    "",
    "- No panel numbers.",
    "- No captions.",
    "- No subtitles.",
    "- No typography.",
    "- No arrows.",
    "- No callouts.",
    "- No watermarks.",
    "- No UI.",
    "- No logos unless the product/reference itself contains that logo.",
  ].join("\n");

  const styleSpec = [
    "[COLOR TREATMENT — HARD CONSTRAINT]",
    `Selected treatment: ${style.label}.`,
    `Treatment definition: ${style.prose}.`,
    "",
    "This setting controls photographic post-processing ONLY.",
    "",
    "It may modify only:",
    "- color balance",
    "- white balance",
    "- saturation",
    "- contrast",
    "- luminance",
    "- highlight response",
    "- shadow response",
    "- tonal separation",
    "- photographic grain or subtle post-processing texture when explicitly requested",
    "",
    "It MUST NOT modify:",
    "- character identity",
    "- facial structure",
    "- body shape",
    "- hairstyle",
    "- wardrobe",
    "- product design",
    "- product geometry",
    "- environment",
    "- objects",
    "- architecture",
    "- camera position",
    "- framing",
    "- composition",
    "- visual medium",
    "- rendering technique",
    "",
    "REALISM LOCK:",
    "If the input/reference is photographic, the output MUST remain photographic.",
    "Real humans MUST remain real humans.",
    "Real products MUST remain real photographic products.",
    "",
    "Never convert photographic content into:",
    "- anime",
    "- manga",
    "- cartoon",
    "- illustration",
    "- comic art",
    "- painting",
    "- watercolor",
    "- sketch",
    "- 3D character",
    "- CGI character",
    "- clay render",
    "- stylized avatar",
    "",
    `Apply "${style.label}" consistently to every panel as COLOR GRADING ONLY.`,
  ].join("\n");

  const pacingSpec = [
    "[STORY PACING]",
    "",
    `Progression: ${board.progression}.`,
    PROGRESSION_PROSE[board.progression],
    "",
    "The panels must depict consecutive moments from the same scene.",
    "Do not reset the scene between panels.",
    "Do not introduce unexplained wardrobe, location, lighting or product changes.",
  ].join("\n");

  const cameraSpec = camera
    ? [
      "[CAMERA DIRECTION]",
      "",
      `Selected camera direction: ${camera.label}.`,
      camera.prose,
      "",
      "Camera movement changes viewpoint only.",
      "It must never alter character identity, product design, environment or visual medium.",
    ].join("\n")
    : "";

  const referenceImages = [
    "[REFERENCE IMAGES]",
    "",
    ...(board.referenceUrls.length === 0
      ? [
        "No reference images were supplied.",
        "",
        "Invent ONE cast, ONE wardrobe configuration, ONE product design and ONE environment.",
        "Once established in panel 1, treat those visual details as locked for every remaining panel.",
        "",
        "Do not redesign characters or products between panels.",
      ]
      : [
        `${board.referenceUrls.length} reference image${board.referenceUrls.length === 1 ? " is" : "s are"
        } attached.`,
        "",
        "REFERENCE IMAGES ARE VISUAL GROUND TRUTH.",
        "",
        "Preserve exactly:",
        "- facial identity",
        "- age appearance",
        "- hairstyle",
        "- skin appearance",
        "- body proportions",
        "- wardrobe",
        "- accessories",
        "- product geometry",
        "- product materials",
        "- product colors",
        "- labels",
        "- logos",
        "- environment details when established",
        "",
        "Do not beautify, redesign, stylize or reinterpret details already established by a reference.",
        "",
        "The reference determines WHAT things look like.",
        "The storyboard instructions determine only CAMERA, ACTION, COMPOSITION and COLOR GRADE.",
      ]),
  ].join("\n");

  const sceneDescription = [
    "[SCENE / STORY REQUEST]",
    "",
    board.prompt.trim(),
  ].join("\n");

  const continuitySpec = [
    "[STRICT CONTINUITY RULES]",
    "",
    "Treat panel 1 as the visual continuity anchor.",
    "",
    "For panels 2 through the final panel:",
    "- preserve the character identity unchanged",
    "- preserve facial structure",
    "- preserve hairstyle",
    "- preserve wardrobe construction and colors",
    "- preserve product geometry",
    "- preserve product dimensions and proportions",
    "- preserve product materials",
    "- preserve product labels and logos",
    "- preserve environmental architecture and props",
    "- preserve lighting direction",
    "- preserve time of day",
    "- preserve photographic realism",
    "- preserve the selected color grade",
    "",
    "Allowed changes between panels:",
    "- camera position",
    "- camera distance",
    "- lens/framing",
    "- character pose",
    "- facial expression",
    "- natural object movement",
    "- story action",
    "",
    "Everything else remains visually locked.",
  ].join("\n");

  const antiFailureSpec = [
    "[FAILURE PREVENTION]",
    "",
    "Before rendering, internally verify:",
    `0. The canvas is ${orientation} at approximately ${spokenRatio(board.aspectRatio)}.`,
    `1. Exactly ${board.columns} columns are present — counted left to right along one row.`,
    `2. Exactly ${board.rows} rows are present — counted top to bottom down one column.`,
    `3. Exactly ${board.panels} panels are present.`,
    "4. Every panel is the same size.",
    "5. All panels belong to one continuous scene.",
    "6. Character identity is unchanged.",
    "7. Product appearance is unchanged.",
    "8. Environment is unchanged.",
    "9. Visual medium is unchanged.",
    `10. ${style.label} affects color grading only.`,
    "",
    "If any requirement conflicts with decorative creativity, obey these structural and continuity requirements instead.",
    "",
    `If the count is wrong, redraw the board as ${board.columns} columns × ${board.rows} rows before returning it.`,
    "A board with the wrong number of rows, columns or panels is a failed result, however good it looks.",
  ].join("\n");

  return [
    role,
    gridSpec,
    orderSpec,
    outputSpec,
    styleSpec,
    pacingSpec,
    cameraSpec,
    referenceImages,
    sceneDescription,
    continuitySpec,
    antiFailureSpec,
  ]
    .filter(Boolean)
    .join("\n\n");
}