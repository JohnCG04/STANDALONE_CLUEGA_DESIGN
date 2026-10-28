// The kit <-> draft <-> style_guide mappings. Everything here is pure.
//
// `kitToStyleGuide` IS A PREVIEW, NOT A CONTRACT. The server does the real
// projection on import, so after every write the client throws its guess away
// and keeps the `style_guide` from the response. This function exists for two
// reasons: so the editor can show what will actually render before the first
// save, and so §4's mapping table is pinned by tests rather than by hope.
//
// The direction that matters most is `applyStyleGuide`. §5 says "PATCH does not
// update source_kit", so on the second open of an edited brand the kit and the
// guide disagree — and the GUIDE wins for everything it projects. The other way
// round would make every saved edit appear to revert on reload, which is the
// worst bug a settings editor can have.

import { joinSentence, reconcileList } from "./text";
import { emptyStyleGuide } from "./parse";
import {
  BRAND_KIT_TYPE_ROLES,
  type Brand,
  type BrandDraft,
  type BrandDraftColor,
  type BrandDraftLogo,
  type BrandDraftRule,
  type BrandDraftTextStyle,
  type BrandKitColor,
  type BrandKitDoc,
  type BrandKitLogoVariant,
  type BrandKitRule,
  type BrandKitTextStyle,
  type BrandLogo,
  type BrandStyleGuide,
  type BrandTextStyle,
} from "./types";

const TYPE_ROLES: readonly string[] = BRAND_KIT_TYPE_ROLES;

/** §4: `weight >= 600` becomes bold. A missing weight is not bold. */
export const isBoldWeight = (weight: number | null | undefined): boolean =>
  typeof weight === "number" && Number.isFinite(weight) && weight >= 600;

/** §4: `size: 72` becomes "72px". A non-positive or absent size yields "". */
export const fontSizePx = (size: number | null | undefined): string =>
  typeof size === "number" && Number.isFinite(size) && size > 0 ? `${size}px` : "";

/**
 * "72px" or "72" -> 72. "4.5rem" -> null, and the draft then keeps the text as
 * typed without emitting a `size` to the kit: inventing 4.5 would be worse than
 * omitting the field.
 */
export function parseFontSizePx(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * §7.1: a listed role passes through with an empty label; anything else becomes
 * `custom` with the original word preserved, so a role the extractor invented
 * round-trips instead of being flattened away.
 */
export function normalizeTypeRole(role: string): { role: string; label: string } {
  const trimmed = role.trim();
  if (TYPE_ROLES.includes(trimmed)) return { role: trimmed, label: "" };
  return { role: trimmed ? "custom" : "", label: trimmed };
}

export function denormalizeTypeRole(role: string, label: string): string {
  return role === "custom" && label ? label : role;
}

/**
 * §9: "`primary` is sorted first on import, so `logos[0]` is the primary mark".
 * STABLE — primary ranks 0, everything else 1, and Array#sort is stable, so the
 * rest keep the order they were authored in.
 */
export function sortPrimaryFirst<T extends { type?: string }>(
  variants: readonly T[],
): T[] {
  return [...variants].sort(
    (a, b) => (a.type === "primary" ? 0 : 1) - (b.type === "primary" ? 0 : 1),
  );
}

const colorHexes = (colors: readonly BrandKitColor[] | undefined): string[] =>
  (colors ?? []).map((color) => color.hex ?? "").filter(Boolean);

const textStyleFromKit = (style: BrandKitTextStyle): BrandTextStyle => {
  const { role, label } = normalizeTypeRole(style.role ?? "");
  return {
    role,
    label,
    font_family: style.fontFamily ?? "",
    font_size: fontSizePx(style.size),
    bold: isBoldWeight(style.weight),
    // The kit schema (§7.1) has no italic, so a projection from a kit can only
    // ever say false. The editor's I toggle reaches the guide through the
    // follow-up PATCH in save.ts.
    italic: false,
  };
};

const logoFromKit = (variant: BrandKitLogoVariant): BrandLogo => ({
  artifact_id: variant.assetUrl ?? "",
  variant: variant.type ?? "",
});

/** §4's mapping table, field for field. See the file header: a preview. */
export function kitToStyleGuide(kit: BrandKitDoc): BrandStyleGuide {
  const guide = emptyStyleGuide();

  guide.mission = kit.mission?.statement ?? "";
  guide.tone = joinSentence(kit.tone?.personality ?? []);
  guide.banned_claims = (kit.tone?.vocabulary?.avoid ?? []).filter(Boolean);

  // Brand colours first, then neutrals. `semantic` is NOT projected — §4's
  // table names only these two lists.
  guide.colors = [
    ...colorHexes(kit.colors?.brand),
    ...colorHexes(kit.colors?.neutrals),
  ];

  guide.text_styles = (kit.typography?.styles ?? []).map(textStyleFromKit);

  // A variant with no assetUrl is dropped: there is nothing to composite.
  guide.logos = sortPrimaryFirst(kit.logo?.variants ?? [])
    .map(logoFromKit)
    .filter((logo) => logo.artifact_id !== "");

  const ruleItems = kit.rules?.items ?? [];
  guide.prompt_rules = {
    do: ruleItems
      .filter((rule) => rule.type === "do")
      .map((rule) => rule.text ?? "")
      .filter(Boolean),
    // §4: the logo donts are "merged with the rules below", so they come first.
    dont: [
      ...(kit.logo?.rules?.donts ?? []),
      ...ruleItems
        .filter((rule) => rule.type === "dont")
        .map((rule) => rule.text ?? ""),
    ].filter(Boolean),
  };

  guide.photography = {
    brand_assets: [...(kit.photography?.moodboard ?? [])].filter(Boolean),
    assets_description: kit.photography?.subjectMatter ?? "",
    lighting: joinSentence(kit.photography?.style?.lighting ?? []),
    mood: joinSentence(kit.photography?.style?.mood ?? []),
    composition: joinSentence(kit.photography?.style?.composition ?? []),
    color_treatment: joinSentence(kit.photography?.style?.colorTreatment ?? []),
  };

  const customRules = kit.layout?.customRules ?? "";
  guide.spacing = {
    composition_styles: kit.layout?.composition ?? "",
    white_space: kit.layout?.whitespace ?? "",
    // One string becomes a one-entry list; an empty string becomes no entries.
    custom_rules: customRules ? [customRules] : [],
  };

  return guide;
}

// ─────────────────────────────────────────────────────────────────────────────
// kit -> draft
// ─────────────────────────────────────────────────────────────────────────────

const draftColor = (
  color: BrandKitColor,
  group: BrandDraftColor["group"],
): BrandDraftColor => ({
  hex: color.hex ?? "",
  name: color.name ?? "",
  role: color.role ?? "",
  usage: color.usage ?? "",
  variants: color.variants ?? {},
  group,
});

const draftTextStyle = (style: BrandKitTextStyle): BrandDraftTextStyle => {
  const { role, label } = normalizeTypeRole(style.role ?? "");
  return {
    role,
    label,
    fontFamily: style.fontFamily ?? "",
    fontSize: fontSizePx(style.size),
    bold: isBoldWeight(style.weight),
    italic: false,
    weight: typeof style.weight === "number" ? style.weight : null,
    lineHeight: typeof style.lineHeight === "number" ? style.lineHeight : null,
    letterSpacing:
      typeof style.letterSpacing === "number" ? style.letterSpacing : null,
    usage: style.usage ?? "",
  };
};

const draftLogo = (variant: BrandKitLogoVariant): BrandDraftLogo => ({
  artifactId: variant.assetUrl ?? "",
  variant: variant.type ?? "",
  fileName: variant.fileName ?? "",
  format: variant.format ?? "",
});

const draftRule = (
  rule: BrandKitRule,
  index: number,
): BrandDraftRule | null => {
  const text = rule.text ?? "";
  if (!text) return null;
  return {
    // Minted where absent so React keys and the reattach-by-text step have
    // something stable to work with.
    id: rule.id ?? `rule-${index + 1}`,
    type: rule.type === "dont" ? "dont" : "do",
    category: rule.category ?? "",
    text,
    imageUrl: rule.imageUrl ?? "",
    origin: "rules",
  };
};

export function emptyKit(): BrandKitDoc {
  return {};
}

export function emptyDraft(): BrandDraft {
  return {
    brandId: null,
    name: "",
    description: "",
    mission: { statement: "", values: [] },
    colors: [],
    textStyles: [],
    logos: [],
    logoRules: { clearSpace: null, minimumSize: null },
    photography: {
      moodboard: [],
      lighting: [],
      mood: [],
      composition: [],
      colorTreatment: [],
      subjectMatter: "",
      avoid: "",
    },
    tone: {
      personality: [],
      soundsLike: "",
      doesntSoundLike: "",
      samplePhrases: [],
      vocabularyUse: [],
      vocabularyAvoid: [],
    },
    layout: { composition: "", whitespace: "", customRules: [], patterns: [] },
    rules: [],
    disclaimers: [],
    sourceKit: {},
    baseline: emptyStyleGuide(),
    baselineName: "",
    unreadableLogos: [],
  };
}

/** The draft a kit describes. Lossless in the kit's direction. */
export function kitToDraft(kit: BrandKitDoc): BrandDraft {
  const draft = emptyDraft();
  draft.sourceKit = kit;
  draft.name = kit.name ?? "";

  draft.mission = {
    statement: kit.mission?.statement ?? "",
    values: [...(kit.mission?.values ?? [])],
  };

  draft.colors = [
    ...(kit.colors?.brand ?? []).map((color) => draftColor(color, "brand")),
    ...(kit.colors?.neutrals ?? []).map((color) => draftColor(color, "neutral")),
    ...(kit.colors?.semantic ?? []).map((color) => draftColor(color, "semantic")),
  ];

  draft.textStyles = (kit.typography?.styles ?? []).map(draftTextStyle);

  draft.logos = sortPrimaryFirst(kit.logo?.variants ?? []).map(draftLogo);
  draft.logoRules = {
    clearSpace:
      typeof kit.logo?.rules?.clearSpace === "number"
        ? kit.logo.rules.clearSpace
        : null,
    minimumSize:
      typeof kit.logo?.rules?.minimumSize === "number"
        ? kit.logo.rules.minimumSize
        : null,
  };

  draft.photography = {
    moodboard: [...(kit.photography?.moodboard ?? [])],
    lighting: [...(kit.photography?.style?.lighting ?? [])],
    mood: [...(kit.photography?.style?.mood ?? [])],
    composition: [...(kit.photography?.style?.composition ?? [])],
    colorTreatment: [...(kit.photography?.style?.colorTreatment ?? [])],
    subjectMatter: kit.photography?.subjectMatter ?? "",
    avoid: kit.photography?.avoid ?? "",
  };

  draft.tone = {
    personality: [...(kit.tone?.personality ?? [])],
    soundsLike: kit.tone?.soundsLike ?? "",
    doesntSoundLike: kit.tone?.doesntSoundLike ?? "",
    samplePhrases: [...(kit.tone?.samplePhrases ?? [])],
    vocabularyUse: [...(kit.tone?.vocabulary?.use ?? [])],
    vocabularyAvoid: [...(kit.tone?.vocabulary?.avoid ?? [])],
  };

  const customRules = kit.layout?.customRules ?? "";
  draft.layout = {
    composition: kit.layout?.composition ?? "",
    whitespace: kit.layout?.whitespace ?? "",
    customRules: customRules ? [customRules] : [],
    patterns: [...(kit.layout?.patterns ?? [])],
  };

  // The logo donts and the rule items are one list in the editor: a logo dont
  // that lived only under `logo.rules` would be invisible in the UI and still
  // apply at render. `origin` is what puts each one back where it came from.
  draft.rules = [
    ...(kit.logo?.rules?.donts ?? [])
      .filter(Boolean)
      .map((text, index) => ({
        id: `logo-dont-${index + 1}`,
        type: "dont" as const,
        category: "",
        text,
        imageUrl: "",
        origin: "logoRules" as const,
      })),
    ...(kit.rules?.items ?? [])
      .map(draftRule)
      .filter((rule): rule is BrandDraftRule => rule !== null),
  ];

  return draft;
}

// ─────────────────────────────────────────────────────────────────────────────
// style_guide -> draft (the guide wins; the kit only re-labels)
// ─────────────────────────────────────────────────────────────────────────────

const sameText = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Put back the facts the projection threw away, matched on a VALUE rather than
 * a position — a list the user reordered must not relabel its rows.
 *
 * A colour whose hex was changed through PATCH loses its name. That is the
 * documented §5 gap, not a bug here.
 */
export function reattachKitAnnotations(
  fromKit: BrandDraft,
  fromGuide: BrandDraft,
): BrandDraft {
  const colors = fromGuide.colors.map((color) => {
    const match = fromKit.colors.find((candidate) =>
      sameText(candidate.hex, color.hex),
    );
    return match
      ? {
          ...color,
          name: match.name,
          role: match.role,
          usage: match.usage,
          variants: match.variants,
          group: match.group,
        }
      : color;
  });

  const rules = fromGuide.rules.map((rule) => {
    const match = fromKit.rules.find(
      (candidate) => candidate.type === rule.type && sameText(candidate.text, rule.text),
    );
    return match
      ? { ...rule, category: match.category, imageUrl: match.imageUrl, origin: match.origin }
      : rule;
  });

  const logos = fromGuide.logos.map((logo) => {
    // §9: an SVG's artifact_id is REWRITTEN at import, so match on the id first
    // and fall back to the pre-conversion url the kit still remembers.
    const match =
      fromKit.logos.find((candidate) => candidate.artifactId === logo.artifactId) ??
      fromKit.logos.find((candidate) => candidate.variant === logo.variant);
    return match ? { ...logo, fileName: match.fileName, format: match.format } : logo;
  });

  const textStyles = fromGuide.textStyles.map((style) => {
    const match = fromKit.textStyles.find(
      (candidate) =>
        candidate.role === style.role &&
        sameText(candidate.fontFamily, style.fontFamily),
    );
    return match
      ? {
          ...style,
          weight: match.weight,
          lineHeight: match.lineHeight,
          letterSpacing: match.letterSpacing,
          usage: match.usage,
        }
      : style;
  });

  return { ...fromGuide, colors, rules, logos, textStyles };
}

/**
 * The draft for a brand that already exists.
 *
 * `style_guide` is the source of truth for everything it projects — it is what
 * renders. `source_kit` is consulted only for the labels it has no room for, so
 * a brand without one degrades to "the value with no label", not to a blocked
 * editor.
 *
 * Legacy fields (§7.2) are ABSORBED rather than ignored: ignoring them is safe
 * for reading and unsafe for writing. See patch.ts.
 */
export function brandToDraft(brand: Brand): BrandDraft {
  const guide = brand.style_guide;
  const fromKit = kitToDraft(brand.source_kit);

  const draft = emptyDraft();
  draft.brandId = brand.brand_id;
  draft.name = brand.name;
  draft.description = brand.description;
  draft.sourceKit = brand.source_kit;
  draft.baseline = guide;
  draft.baselineName = brand.name;
  draft.unreadableLogos = brand.unreadable_logos;

  draft.mission = {
    statement: guide.mission,
    // kit-only: the guide cannot carry these at all.
    values: fromKit.mission.values,
  };

  draft.colors = guide.colors.map((hex) => ({
    hex,
    name: "",
    role: "",
    usage: "",
    variants: {},
    group: "brand" as const,
  }));

  draft.textStyles = guide.text_styles.map((style) => ({
    role: style.role,
    label: style.label,
    fontFamily: style.font_family,
    fontSize: style.font_size,
    bold: style.bold,
    italic: style.italic,
    weight: null,
    lineHeight: null,
    letterSpacing: null,
    usage: "",
  }));

  // Legacy: `fonts` loses to `text_styles` only when the latter is set. With no
  // text styles, surface each font as an editable row instead of dropping it.
  if (draft.textStyles.length === 0 && guide.fonts.length > 0) {
    draft.textStyles = guide.fonts.map((font) => ({
      role: "body",
      label: "",
      fontFamily: font,
      fontSize: "",
      bold: false,
      italic: false,
      weight: null,
      lineHeight: null,
      letterSpacing: null,
      usage: "",
    }));
  }

  draft.logos = guide.logos.map((logo) => ({
    artifactId: logo.artifact_id,
    variant: logo.variant,
    fileName: "",
    format: "",
  }));

  // Legacy: the structured list wins only when it is non-empty, so a brand with
  // just `logo_artifact_id` gets that mark as its primary row — visible and
  // removable, rather than applying invisibly at render.
  if (draft.logos.length === 0 && guide.logo_artifact_id) {
    draft.logos = [
      {
        artifactId: guide.logo_artifact_id,
        variant: "primary",
        fileName: "",
        format: "",
      },
    ];
  }

  draft.logoRules = fromKit.logoRules;

  draft.photography = {
    moodboard: guide.photography.brand_assets,
    // A joined sentence is only re-split when it has diverged from the kit's
    // list, so a lighting note containing a comma survives.
    lighting: reconcileList(fromKit.photography.lighting, guide.photography.lighting),
    mood: reconcileList(fromKit.photography.mood, guide.photography.mood),
    composition: reconcileList(
      fromKit.photography.composition,
      guide.photography.composition,
    ),
    colorTreatment: reconcileList(
      fromKit.photography.colorTreatment,
      guide.photography.color_treatment,
    ),
    subjectMatter: guide.photography.assets_description,
    avoid: fromKit.photography.avoid,
  };

  draft.tone = {
    personality: reconcileList(fromKit.tone.personality, guide.tone),
    soundsLike: fromKit.tone.soundsLike,
    doesntSoundLike: fromKit.tone.doesntSoundLike,
    samplePhrases: fromKit.tone.samplePhrases,
    vocabularyUse: fromKit.tone.vocabularyUse,
    vocabularyAvoid: guide.banned_claims,
  };

  draft.layout = {
    composition: guide.spacing.composition_styles,
    whitespace: guide.spacing.white_space,
    customRules: guide.spacing.custom_rules,
    patterns: fromKit.layout.patterns,
  };

  // §7.2: `do_nots` is JOINED with `prompt_rules.dont`, not overridden — "both
  // are prohibitions and filling one does not retract the other". So the editor
  // shows the union. Without this, deleting a don't that came from `do_nots`
  // would appear to do nothing: it is still joined in at render.
  const dontTexts = [...guide.prompt_rules.dont];
  const legacyDonts = guide.do_nots.filter(
    (text) => !dontTexts.some((candidate) => sameText(candidate, text)),
  );

  draft.rules = [
    ...guide.prompt_rules.do.map((text, index) => ({
      id: `do-${index + 1}`,
      type: "do" as const,
      category: "",
      text,
      imageUrl: "",
      origin: "rules" as const,
    })),
    ...dontTexts.map((text, index) => ({
      id: `dont-${index + 1}`,
      type: "dont" as const,
      category: "",
      text,
      imageUrl: "",
      origin: "rules" as const,
    })),
    ...legacyDonts.map((text, index) => ({
      id: `legacy-dont-${index + 1}`,
      type: "dont" as const,
      category: "",
      text,
      imageUrl: "",
      origin: "legacy" as const,
    })),
  ];

  draft.disclaimers = guide.disclaimers;

  return reattachKitAnnotations(fromKit, draft);
}

// ─────────────────────────────────────────────────────────────────────────────
// draft -> kit
// ─────────────────────────────────────────────────────────────────────────────

const objOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Only the keys this colour actually has.
 *
 * An empty optional is OMITTED rather than written as `""`. §4 asks for the
 * document back as it was handed over, and a kit that gains `usage: ""` and
 * `variants: {}` on every save is a kit this client reshaped — the exact thing
 * §2 warns about. An absent name and an empty name mean the same thing to the
 * service, so clearing a field still reads as cleared.
 */
const kitColor = (color: BrandDraftColor): BrandKitColor => ({
  ...(color.name ? { name: color.name } : {}),
  ...(color.hex ? { hex: color.hex } : {}),
  ...(color.role ? { role: color.role } : {}),
  ...(color.usage ? { usage: color.usage } : {}),
  ...(Object.keys(color.variants).length > 0 ? { variants: color.variants } : {}),
});

const kitTextStyle = (style: BrandDraftTextStyle): BrandKitTextStyle => {
  const size = parseFontSizePx(style.fontSize);
  // An untouched weight is kept as authored, so a 600 does not silently become
  // a 700 just because the row reads as bold.
  const weight =
    style.weight !== null && isBoldWeight(style.weight) === style.bold
      ? style.weight
      : style.bold
        ? 700
        : 400;
  const role = denormalizeTypeRole(style.role, style.label);
  return {
    ...(role ? { role } : {}),
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    weight,
    ...(size !== null ? { size } : {}),
    ...(style.lineHeight !== null ? { lineHeight: style.lineHeight } : {}),
    ...(style.letterSpacing !== null ? { letterSpacing: style.letterSpacing } : {}),
    ...(style.usage ? { usage: style.usage } : {}),
  };
};

const kitLogoVariant = (logo: BrandDraftLogo): BrandKitLogoVariant => ({
  ...(logo.variant ? { type: logo.variant } : {}),
  ...(logo.artifactId ? { assetUrl: logo.artifactId } : {}),
  ...(logo.fileName ? { fileName: logo.fileName } : {}),
  ...(logo.format ? { format: logo.format } : {}),
});

/**
 * The document to post.
 *
 * The spread is the whole design. §4: "Unknown keys are accepted, not rejected…
 * Send the document as-is." Every key this function does not name —
 * `templateId`, `sourceMeta`, `confidence`, `trainedAt`, `status` — rides
 * through untouched, and so does an unknown key nested INSIDE `tone` or
 * `logo.rules`, because each branch spreads its own original too.
 */
export function draftToKit(draft: BrandDraft): BrandKitDoc {
  const kit = draft.sourceKit;
  const customRules = draft.layout.customRules.filter(Boolean).join("\n");

  return {
    ...kit,
    name: draft.name,
    mission: {
      ...objOf(kit.mission),
      statement: draft.mission.statement,
      values: draft.mission.values,
    },
    tone: {
      ...objOf(kit.tone),
      personality: draft.tone.personality,
      soundsLike: draft.tone.soundsLike,
      doesntSoundLike: draft.tone.doesntSoundLike,
      samplePhrases: draft.tone.samplePhrases,
      vocabulary: {
        ...objOf(objOf(kit.tone).vocabulary),
        use: draft.tone.vocabularyUse,
        avoid: draft.tone.vocabularyAvoid,
      },
    },
    colors: {
      ...objOf(kit.colors),
      brand: draft.colors.filter((c) => c.group === "brand").map(kitColor),
      neutrals: draft.colors.filter((c) => c.group === "neutral").map(kitColor),
      semantic: draft.colors.filter((c) => c.group === "semantic").map(kitColor),
    },
    typography: {
      ...objOf(kit.typography),
      styles: draft.textStyles.map(kitTextStyle),
    },
    logo: {
      ...objOf(kit.logo),
      variants: draft.logos.map(kitLogoVariant),
      rules: {
        ...objOf(objOf(kit.logo).rules),
        ...(draft.logoRules.clearSpace !== null
          ? { clearSpace: draft.logoRules.clearSpace }
          : {}),
        ...(draft.logoRules.minimumSize !== null
          ? { minimumSize: draft.logoRules.minimumSize }
          : {}),
        donts: draft.rules
          .filter((rule) => rule.origin === "logoRules" && rule.type === "dont")
          .map((rule) => rule.text),
      },
    },
    photography: {
      ...objOf(kit.photography),
      moodboard: draft.photography.moodboard,
      style: {
        ...objOf(objOf(kit.photography).style),
        lighting: draft.photography.lighting,
        mood: draft.photography.mood,
        composition: draft.photography.composition,
        colorTreatment: draft.photography.colorTreatment,
      },
      subjectMatter: draft.photography.subjectMatter,
      avoid: draft.photography.avoid,
    },
    layout: {
      ...objOf(kit.layout),
      composition: draft.layout.composition,
      whitespace: draft.layout.whitespace,
      patterns: draft.layout.patterns,
      customRules,
    },
    rules: {
      ...objOf(kit.rules),
      // A `logoRules` rule goes back under logo.rules.donts, not here. A
      // `legacy` one is written here, which is how a `do_nots` entry graduates
      // into the document (patch.ts clears the legacy field at the same time).
      items: draft.rules
        .filter((rule) => rule.origin !== "logoRules")
        .map((rule) => ({
          id: rule.id,
          type: rule.type,
          ...(rule.category ? { category: rule.category } : {}),
          text: rule.text,
          ...(rule.imageUrl ? { imageUrl: rule.imageUrl } : {}),
        })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// draft -> style_guide
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the draft will render as: §4's table again, sourced from the draft, plus
 * the three things the kit cannot express — `disclaimers`, `text_styles[].italic`
 * and a logo added by upload (a storage id, not an `assetUrl`).
 *
 * This, not `kitToStyleGuide`, is what every PATCH body is built from, so the
 * create and the edit paths produce identical results.
 */
export function draftToStyleGuide(draft: BrandDraft): BrandStyleGuide {
  const guide = emptyStyleGuide();

  guide.mission = draft.mission.statement;
  guide.tone = joinSentence(draft.tone.personality);
  guide.banned_claims = draft.tone.vocabularyAvoid.filter(Boolean);

  const seen = new Set<string>();
  guide.colors = [
    ...draft.colors.filter((c) => c.group === "brand"),
    ...draft.colors.filter((c) => c.group === "neutral"),
  ]
    .map((color) => color.hex)
    .filter((hex) => {
      if (!hex) return false;
      const key = hex.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  guide.text_styles = draft.textStyles.map((style) => ({
    role: style.role,
    label: style.label,
    font_family: style.fontFamily,
    font_size: style.fontSize,
    bold: style.bold,
    italic: style.italic,
  }));

  guide.logos = draft.logos
    .filter((logo) => logo.artifactId !== "")
    .map((logo) => ({ artifact_id: logo.artifactId, variant: logo.variant }));

  guide.prompt_rules = {
    do: draft.rules
      .filter((rule) => rule.type === "do")
      .map((rule) => rule.text)
      .filter(Boolean),
    dont: draft.rules
      .filter((rule) => rule.type === "dont")
      .map((rule) => rule.text)
      .filter(Boolean),
  };

  guide.photography = {
    brand_assets: draft.photography.moodboard.filter(Boolean),
    assets_description: draft.photography.subjectMatter,
    lighting: joinSentence(draft.photography.lighting),
    mood: joinSentence(draft.photography.mood),
    composition: joinSentence(draft.photography.composition),
    color_treatment: joinSentence(draft.photography.colorTreatment),
  };

  guide.spacing = {
    composition_styles: draft.layout.composition,
    white_space: draft.layout.whitespace,
    custom_rules: draft.layout.customRules.filter(Boolean),
  };

  guide.disclaimers = draft.disclaimers.filter(Boolean);

  return guide;
}

/** The draft a template seeds, remembering which card it came from (§3). */
export function templateToDraft(template: {
  id: string;
  name: string;
  kit: BrandKitDoc;
}): BrandDraft {
  // §3: "if you want to remember it, put the template id into the kit before
  // posting — unknown keys are preserved in source_kit".
  const draft = kitToDraft({ ...template.kit, templateId: template.id });
  draft.name = template.kit.name ?? template.name;
  return draft;
}
