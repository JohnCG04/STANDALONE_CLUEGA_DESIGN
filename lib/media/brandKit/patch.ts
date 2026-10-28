// The PATCH body: a MINIMAL DIFF, and §5's semantics are the reason.
//
//   field omitted            -> KEPT as it was
//   "field": "" / []         -> CLEARED
//   photography / spacing /
//     prompt_rules           -> merged ONE level deep
//   text_styles / logos      -> replace the WHOLE list
//
// Only a diff can tell "the user did not touch this" from "the user emptied
// this", so sending a whole serialised style guide is not a shortcut — it would
// clear every field the editor happens to have no value for. That is why
// BrandStyleGuidePatch is a separate type from BrandStyleGuide.

import type {
  BrandPhotography,
  BrandPromptRules,
  BrandSpacing,
  BrandStyleGuide,
  BrandStyleGuidePatch,
} from "./types";

export type PatchOptions = {
  /**
   * Keys the SERVER owns, which the client must not write back.
   *
   * Set to ["logos", "photography.brand_assets"] for the patch that follows an
   * import. §9: "SVG logos are converted to PNG at import … `logos[].artifact_id`
   * is rewritten to the converted asset — so the value you read back may differ
   * from the `assetUrl` you sent." A naive diff sees that difference and PATCHes
   * the pre-conversion urls straight back, undoing the conversion and leaving a
   * mark that cannot be composited.
   */
  skip?: readonly string[];
};

const sameStrings = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The changed sub-keys of an object that merges one level deep, or undefined
 * when nothing in it moved.
 */
function mergedDiff<T extends object>(
  baseline: T,
  next: T,
  skip: (key: string) => boolean,
): Partial<T> | undefined {
  const patch: Partial<T> = {};
  let changed = false;
  for (const key of Object.keys(next) as (keyof T & string)[]) {
    if (skip(key)) continue;
    if (sameJson(baseline[key], next[key])) continue;
    patch[key] = next[key];
    changed = true;
  }
  return changed ? patch : undefined;
}

/**
 * What to send so the server holds `next` — and nothing else changes.
 *
 * Returns `{}` when nothing moved, and the caller then skips the request
 * entirely: there is no round trip to spend, and §8's write-time moderation
 * does not run on a no-op.
 */
export function buildStyleGuidePatch(
  baseline: BrandStyleGuide,
  next: BrandStyleGuide,
  options: PatchOptions = {},
): BrandStyleGuidePatch {
  const skipped = new Set(options.skip ?? []);
  const isSkipped = (path: string) => skipped.has(path);
  const patch: BrandStyleGuidePatch = {};

  // ── scalars and string lists ────────────────────────────────────────────
  if (!isSkipped("colors") && !sameStrings(baseline.colors, next.colors)) {
    patch.colors = next.colors;
  }
  if (!isSkipped("tone") && baseline.tone !== next.tone) patch.tone = next.tone;
  if (!isSkipped("mission") && baseline.mission !== next.mission) {
    patch.mission = next.mission;
  }
  if (
    !isSkipped("disclaimers") &&
    !sameStrings(baseline.disclaimers, next.disclaimers)
  ) {
    patch.disclaimers = next.disclaimers;
  }
  if (
    !isSkipped("banned_claims") &&
    !sameStrings(baseline.banned_claims, next.banned_claims)
  ) {
    patch.banned_claims = next.banned_claims;
  }

  // ── lists of objects: replaced wholesale ────────────────────────────────
  // §5: "there is no key to match a row on and matching by index would silently
  // rewrite the wrong one — so send the full list when editing one entry."
  if (!isSkipped("text_styles") && !sameJson(baseline.text_styles, next.text_styles)) {
    patch.text_styles = next.text_styles;
    // Legacy `fonts` loses to `text_styles`, but only while `text_styles` is
    // set. Clearing it as we adopt its content stops a stale typeface coming
    // back the moment the list is emptied again.
    patch.fonts = [];
  }
  if (!isSkipped("logos") && !sameJson(baseline.logos, next.logos)) {
    patch.logos = next.logos;
    // Same shape of problem one rung down: with `logos` written, a leftover
    // `logo_artifact_id` is a mark the user cannot see but the render can.
    patch.logo_artifact_id = "";
  }

  // ── objects that merge one level deep ───────────────────────────────────
  const photography = mergedDiff<BrandPhotography>(
    baseline.photography,
    next.photography,
    (key) => isSkipped(`photography.${key}`),
  );
  if (photography) patch.photography = photography;

  const spacing = mergedDiff<BrandSpacing>(
    baseline.spacing,
    next.spacing,
    (key) => isSkipped(`spacing.${key}`),
  );
  if (spacing) patch.spacing = spacing;

  const promptRules = mergedDiff<BrandPromptRules>(
    baseline.prompt_rules,
    next.prompt_rules,
    (key) => isSkipped(`prompt_rules.${key}`),
  );
  if (promptRules) {
    patch.prompt_rules = promptRules;
    // §7.2: `do_nots` and `prompt_rules.dont` are JOINED, not overridden —
    // "both are prohibitions and filling one does not retract the other". So a
    // don't the user deleted would come back from `do_nots` forever. The editor
    // shows the union (see brandToDraft), and writing the union here retires
    // the legacy field in the same request.
    if (promptRules.dont !== undefined && baseline.do_nots.length > 0) {
      patch.do_nots = [];
    }
  }

  // `palette`, `typography`, `camera_language` and `lighting` are absent from
  // BrandStyleGuidePatch on purpose: the editor owns no field for them, and
  // omitted means kept, so a legacy brand's prose survives untouched.

  return patch;
}

/** Whether a built patch would actually send anything. */
export function isEmptyPatch(patch: BrandStyleGuidePatch): boolean {
  return Object.keys(patch).length === 0;
}
