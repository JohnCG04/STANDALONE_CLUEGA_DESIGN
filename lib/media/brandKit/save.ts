// The two save orchestrations, and the seeds the editor opens from.
//
// Both take TWO requests and neither second is optional: create imports the
// kit, update PUTs it, and each is followed by the patch carrying what the kit
// has no field for. Both re-seed from the response, because the server's
// projection is the truth about what will render.

import { buildStyleGuidePatch, isEmptyPatch } from "./patch";
import {
  brandToDraft,
  draftToKit,
  draftToStyleGuide,
  emptyDraft,
  kitToDraft,
  templateToDraft,
} from "./projection";
import { importBrand, replaceBrandKit, updateBrand } from "./client";
import type { Brand, BrandDraft, BrandKitTemplate, BrandPatch } from "./types";

/**
 * Keys the import response owns, which the follow-up patch must not write back.
 *
 * §9: SVG logos are converted to PNG at import and `logos[].artifact_id` is
 * rewritten to the converted asset. A plain diff sees our posted `.svg` next to
 * the server's `.png`, calls it a change, and PATCHes the conversion away.
 */
const IMPORT_OWNED_KEYS = ["logos", "photography.brand_assets"] as const;

/**
 * Create a brand from the draft.
 *
 * Two requests. `disclaimers` and `text_styles[].italic` have NO kit field —
 * §4's mapping table produces no `disclaimers` row, yet §7.2's example carries
 * ["18+", "Play responsibly"] — so a Compliance section filled in before the
 * first save would silently vanish without the follow-up. Making
 * `draftToStyleGuide` the single authority for the style guide also means the
 * create and the edit paths land on identical results.
 *
 * If the PATCH fails the brand EXISTS and has an id: the caller re-seeds from
 * `partial` and a second Save retries only the patch.
 */
export async function saveNewBrand(
  draft: BrandDraft,
  signal?: AbortSignal,
): Promise<Brand> {
  const created = await importBrand(draftToKit(draft), signal);

  const patch = buildStyleGuidePatch(created.style_guide, draftToStyleGuide(draft), {
    skip: IMPORT_OWNED_KEYS,
  });
  const body: BrandPatch = {};
  if (!isEmptyPatch(patch)) body.style_guide = patch;
  if (draft.description && draft.description !== created.description) {
    body.description = draft.description;
  }
  if (draft.name && draft.name !== created.name) body.name = draft.name;

  if (Object.keys(body).length === 0) return created;
  return updateBrand(created.brand_id, body, signal);
}

/**
 * Save an existing brand — the same two requests as a create, at an existing id.
 *
 * `PUT` replaces `source_kit` and re-projects the guide from it, which is what
 * makes the kit-only fields (a colour's name, `mission.values`,
 * `tone.soundsLike`) editable at all: `PATCH` never touches the kit.
 *
 * A PUT and not a second import, because an import mints a NEW `brand_id` —
 * orphaning every product that referenced the old one.
 *
 * Then the patch a create also needs: `disclaimers` and `text_styles[].italic`
 * have no kit field. `IMPORT_OWNED_KEYS` is skipped identically.
 */
export async function saveExistingBrand(
  draft: BrandDraft,
  signal?: AbortSignal,
): Promise<Brand> {
  if (!draft.brandId) throw new Error("brand kit: cannot replace a brand with no id");

  const replaced = await replaceBrandKit(draft.brandId, draftToKit(draft), signal);

  const patch = buildStyleGuidePatch(replaced.style_guide, draftToStyleGuide(draft), {
    skip: IMPORT_OWNED_KEYS,
  });
  const body: BrandPatch = {};
  if (!isEmptyPatch(patch)) body.style_guide = patch;
  if (draft.description && draft.description !== replaced.description) {
    body.description = draft.description;
  }
  if (draft.name && draft.name !== replaced.name) body.name = draft.name;

  if (Object.keys(body).length === 0) return replaced;
  return updateBrand(draft.brandId, body, signal);
}

/** Save, whichever kind of save this draft needs. */
export function saveBrandDraft(
  draft: BrandDraft,
  signal?: AbortSignal,
): Promise<Brand> {
  return draft.brandId ? saveExistingBrand(draft, signal) : saveNewBrand(draft, signal);
}

/**
 * Whether a draft would send anything at all.
 *
 * The kit is compared too: a colour's name can change while every hex stays
 * put, and a style-guide diff would see nothing — leaving Save disabled on a
 * real edit.
 */
export function hasPendingChanges(draft: BrandDraft): boolean {
  if (!draft.brandId) return true;
  if (draft.name !== draft.baselineName) return true;
  if (!isEmptyPatch(buildStyleGuidePatch(draft.baseline, draftToStyleGuide(draft)))) {
    return true;
  }
  return JSON.stringify(draftToKit(draft)) !== JSON.stringify(draft.sourceKit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeds
// ─────────────────────────────────────────────────────────────────────────────

/** A blank brand. §4: `POST {"name": "Bare"}` is a valid empty brand. */
export function draftForBlank(): BrandDraft {
  return emptyDraft();
}

/** A draft seeded from a sample kit, remembering which card it came from (§3). */
export function draftForTemplate(template: BrandKitTemplate): BrandDraft {
  return templateToDraft(template);
}

/** A draft for a brand that already exists. */
export function draftForBrand(brand: Brand): BrandDraft {
  return brandToDraft(brand);
}

/** A draft seeded from a bare kit document, for a caller that has one in hand. */
export function draftForKit(kit: Parameters<typeof kitToDraft>[0]): BrandDraft {
  return kitToDraft(kit);
}

/**
 * Re-seed from a write's response: the server's projection replaces the
 * client's preview, and the baseline moves so the editor reads as clean.
 *
 * `sourceKit` comes from the posted document on BOTH paths now — create imports
 * it, edit PUTs it, so either way what we sent is what is stored.
 */
export function draftAfterSave(draft: BrandDraft, saved: Brand): BrandDraft {
  return { ...brandToDraft(saved), sourceKit: draftToKit(draft) };
}
