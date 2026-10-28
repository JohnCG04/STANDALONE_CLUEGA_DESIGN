// The tenant's Brand Kit — what every generated image has to obey (PRD IMG-21).
//
//   types.ts       the three shapes: kit, style_guide, draft
//   text.ts        joining and un-joining the sentences §4 asks for
//   parse.ts       wire -> domain                        (+ parse.test.ts)
//   projection.ts  kit <-> draft <-> style_guide, pure    (+ projection.test.ts)
//   patch.ts       the minimal PATCH diff §5 requires     (+ patch.test.ts)
//   errors.ts      §8's status table, classified          (+ errors.test.ts)
//   client.ts      the nine requests
//   save.ts        create = import + patch; edit = patch
//
// Split out of a single lib/media/brandKit.ts when the page became a list and a
// nine-section editor. The barrel keeps `@/lib/media/brandKit` resolving, so
// brandSelection.ts and the composer's brand pill did not have to move.
//
// ── Accepted gaps, to raise with the service ────────────────────────────────
//
// 1. `PATCH` does not update `source_kit` (§5). So on a saved brand the
//    kit-only fields — `mission.values`,
//    `tone.soundsLike`/`doesntSoundLike`/`samplePhrases`/`vocabulary.use`, a
//    rule's `category`, `layout.patterns`, `photography.avoid` and the logo's
//    clear-space/minimum-size — are READ-ONLY in the editor. Ask for a
//    `source_kit` key on PATCH, or `PUT /ads/brands/{id}/kit`.
//    NARROWED: a colour's `role` and `usage` are no longer decoration. The
//    service projects them onto the style_guide as `color_styles` and states
//    each hex WITH its job in the render prompt ("primary #E8521D (the
//    dominant colour — lead with it)"), and `typography.styles[].usage` the
//    same way. Both already round-trip through save.ts, which posts the whole
//    kit — so the role pickers in the colour and type sections are live, with
//    no change here. The colour NAME stays editor-only, by design.
// 2. `disclaimers` and `text_styles[].italic` have no kit field, which is why
//    creating a brand costs two requests instead of one.
// 3. `text_styles` and `logos` have no per-row key (§5), so editing one field
//    replaces the whole list — which races two open tabs.
// 4. A `content_policy` refusal (§8) names no field, only a code, so the editor
//    can highlight all five moderated sections but not the offending one.
// 5. §9's SVG->PNG rewrite carries no marker, so the client cannot tell a
//    converted `artifact_id` from one a user typed. That is why the follow-up
//    patch after an import has to skip `logos` wholesale.

export {
  createBrand,
  deleteBrand,
  getBrand,
  getBrandKitTemplate,
  getDefaultBrand,
  importBrand,
  importBrandDocument,
  replaceBrandKit,
  listBrandKitTemplates,
  listBrands,
  setDefaultBrand,
  unsetDefaultBrand,
  updateBrand,
} from "./client";

export {
  BrandKitError,
  MODERATED_FIELDS,
  classifyBrandKitError,
  isBrandNotFound,
  isBrandWriteRefused,
} from "./errors";
export type {
  BrandClaimFinding,
  BrandKitErrorCode,
  ClassifiedBrandKitError,
} from "./errors";

export {
  emptyPromptRules,
  emptySpacing,
  emptyStyleGuide,
  parseBrand,
  parseBrandList,
  parseKit,
  parseStyleGuide,
  parseTemplate,
  parseTemplateList,
} from "./parse";

export {
  brandToDraft,
  denormalizeTypeRole,
  draftToKit,
  draftToStyleGuide,
  emptyDraft,
  emptyKit,
  fontSizePx,
  isBoldWeight,
  kitToDraft,
  kitToStyleGuide,
  normalizeTypeRole,
  parseFontSizePx,
  reattachKitAnnotations,
  sortPrimaryFirst,
  templateToDraft,
} from "./projection";

export { buildStyleGuidePatch, isEmptyPatch } from "./patch";
export type { PatchOptions } from "./patch";

export {
  draftAfterSave,
  draftForBlank,
  draftForBrand,
  draftForKit,
  draftForTemplate,
  hasPendingChanges,
  saveBrandDraft,
  saveExistingBrand,
  saveNewBrand,
} from "./save";

export { formatList, joinSentence, parseList, reconcileList, splitSentence } from "./text";

export { BRAND_KIT_TYPE_ROLES } from "./types";
export type {
  Brand,
  BrandDocumentExtraction,
  BrandDocumentImport,
  BrandDraft,
  BrandDraftColor,
  BrandDraftLogo,
  BrandDraftRule,
  BrandDraftTextStyle,
  BrandInput,
  BrandKitDoc,
  BrandKitTemplate,
  BrandKitTypeRole,
  BrandLogo,
  BrandPatch,
  BrandPhotography,
  BrandPromptRules,
  BrandSpacing,
  BrandStyleGuide,
  BrandStyleGuidePatch,
  BrandTextStyle,
} from "./types";
