import {
  CAMERA_MOVEMENTS_PREFIX,
  STORYBOARD_CAMERA_MOVEMENT_PRESETS,
  STORYBOARD_STYLE_PRESETS,
  STYLES_PREFIX,
} from "./constants";
import type { StoryboardPreset, Translate } from "./types";

/** A missing key resolves to the path itself, so keep the English label then. */
function localize(
  presets: StoryboardPreset[],
  prefix: string,
  t: Translate,
): StoryboardPreset[] {
  return presets.map((preset) => {
    const key = `${prefix}.${preset.id}`;
    const label = t(key);
    return label && label !== key ? { ...preset, label } : preset;
  });
}

/** The host-owned tiles' labels (the package renders `label` verbatim); ids stay English, being
 *  the wire value and the prose-table key. */
export function localizeStoryboardPresets(t: Translate) {
  return {
    styles: localize(STORYBOARD_STYLE_PRESETS, STYLES_PREFIX, t),
    cameraMovements: localize(
      STORYBOARD_CAMERA_MOVEMENT_PRESETS,
      CAMERA_MOVEMENTS_PREFIX,
      t,
    ),
  };
}
