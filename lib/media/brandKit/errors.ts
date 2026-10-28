// Brand Kit failures, classified once so no surface has to read a raw body.
//
// §8's table is the whole vocabulary, and the awkward part is that 422 covers
// THREE different things — content moderation on a kit's free text, a banned
// claim in a generate prompt, and a plain FastAPI validation error. So the code
// is read before the status, exactly as mapAvatarJobError does.
//
// `detail` also arrives in three shapes: a string (404/409/503), an object (the
// two coded 422s) and an array (FastAPI). All three have to be survivable, and
// a CDN's HTML error page has to degrade to "unknown" without any of it
// reaching a user-visible message.

/** The five fields §8 says moderation checks on POST and PATCH. */
export const MODERATED_FIELDS = [
  "mission",
  "photography.mood",
  "photography.assets_description",
  "spacing.custom_rules",
  "prompt_rules.do",
] as const;

export type BrandKitErrorCode =
  /** 404 — unknown id, or another tenant's brand. §9: 404, never 403. */
  | "not_found"
  /** 409 — DELETE refused: products still reference this brand. */
  | "has_products"
  /** 422 — moderation on a kit's free text, at WRITE time. */
  | "content_policy"
  /** 422 — a banned claim. */
  | "brand_claim"
  /** 422 — FastAPI's array detail. */
  | "validation"
  /** 503 — the ads store is unavailable. */
  | "unavailable"
  /** 415 — the upload was not a readable .docx or .pptx. */
  | "unsupported_document"
  /** 413 — the upload was over the size limit. */
  | "document_too_large"
  /** 422 — the file was read and states nothing about a brand. */
  | "no_brand_facts"
  /** 502 — the model could not be reached, or did not answer usably. */
  | "extraction_failed"
  | "unknown";

/** §6: "`matched` is the exact phrase, safe to show so the user can reword." */
export type BrandClaimFinding = {
  code: string;
  matched: string;
  message: string;
};

export type ClassifiedBrandKitError = {
  code: BrandKitErrorCode;
  /** The backend's own sentence, when it wrote one worth showing. */
  detail: string;
  findings: BrandClaimFinding[];
  /** Parsed out of "still has 2 product(s)". 0 when the message did not say. */
  productCount: number;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");

const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function parseFindings(value: unknown): BrandClaimFinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const finding = obj(row);
      return {
        code: str(finding.code),
        matched: str(finding.matched),
        message: str(finding.message),
      };
    })
    // A finding with no `matched` has nothing to show the user.
    .filter((finding) => finding.matched !== "");
}

/** Pure: status plus a parsed body in, a classification out. */
export function classifyBrandKitError(
  status: number,
  body: unknown,
): ClassifiedBrandKitError {
  const detailValue = obj(body).detail;

  // The coded 422s: an object detail carrying `code`.
  const detailObject = obj(detailValue);
  const code = str(detailObject.code);
  if (code === "brand_claim") {
    return {
      code: "brand_claim",
      detail: str(detailObject.message),
      findings: parseFindings(detailObject.findings),
      productCount: 0,
    };
  }
  if (code === "content_policy") {
    return {
      code: "content_policy",
      detail: str(detailObject.message),
      findings: [],
      productCount: 0,
    };
  }

  // The document import codes. Read BEFORE the status branches for the same
  // reason the two above are: 422 covers three different things here, and the
  // code is the only thing that tells them apart.
  if (
    code === "unsupported_document" ||
    code === "document_too_large" ||
    code === "no_brand_facts" ||
    code === "extraction_failed"
  ) {
    return {
      code,
      detail: str(detailObject.message),
      findings: [],
      productCount: 0,
    };
  }

  // A string detail: the shape 404, 409 and 503 use.
  const sentence = str(detailValue);

  if (status === 404) {
    return { code: "not_found", detail: sentence, findings: [], productCount: 0 };
  }
  if (status === 409) {
    const match = /still has (\d+) product/.exec(sentence);
    return {
      code: "has_products",
      detail: sentence,
      findings: [],
      // A reworded message still classifies; the copy then falls back to a
      // sentence that quotes no number.
      productCount: match ? Number(match[1]) : 0,
    };
  }
  if (status === 503) {
    return { code: "unavailable", detail: sentence, findings: [], productCount: 0 };
  }
  if (status === 422) {
    // FastAPI's validation error is an ARRAY of per-field objects, and none of
    // it is worth showing a user verbatim.
    return {
      code: Array.isArray(detailValue) ? "validation" : "unknown",
      detail: sentence,
      findings: [],
      productCount: 0,
    };
  }

  return { code: "unknown", detail: sentence, findings: [], productCount: 0 };
}

export class BrandKitError extends Error {
  // Written out rather than constructor parameter properties: this module is
  // loaded by `node --test`'s type-strip mode, which rejects those.
  readonly status: number;
  readonly code: BrandKitErrorCode;
  readonly detail: string;
  readonly findings: BrandClaimFinding[];
  readonly productCount: number;

  constructor(status: number, classified: ClassifiedBrandKitError) {
    super(classified.detail || classified.code || `brand_kit_failed_${status}`);
    this.name = "BrandKitError";
    this.status = status;
    this.code = classified.code;
    this.detail = classified.detail;
    this.findings = classified.findings;
    this.productCount = classified.productCount;
  }
}

/** A 404: the brand is gone, or it belongs to another tenant (§9). */
export const isBrandNotFound = (error: unknown): boolean =>
  error instanceof BrandKitError && error.code === "not_found";

/** A save refused by moderation — the draft must survive it. */
export const isBrandWriteRefused = (error: unknown): boolean =>
  error instanceof BrandKitError &&
  (error.code === "content_policy" || error.code === "brand_claim");
