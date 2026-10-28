// HTTP client for the Brand Kit, proxied by CDP at /api/v1/media/ads/...
//
// Transport rules this file must not break:
//
//  * `mediaFetch`, never a raw fetch — it owns the single 401 refresh-and-retry
//    that a long editing session depends on.
//  * NEVER pass `mediaHeaders(...)` into `init.headers`. mediaFetch rebuilds
//    auth on EVERY attempt, so a hand-rolled header freezes a stale token into
//    the retry.
//  * NEVER send `x-api-key` or `X-Tenant-Id`. brandkit.md §1 lists them because
//    it documents media-ai's own contract — but the browser talks to the CDP
//    gateway, which validates the JWT, derives the tenant from its claims and
//    injects both server-side. Sending them from here is at best ignored and at
//    worst a credential in a bundle.
//  * `fetchWithGatewayRetry` on PURE GETs only. An import re-sent after an
//    ambiguous 502 creates a SECOND brand and bills a second moderation pass.
//  * FormData gets no manual content-type, so the browser's multipart boundary
//    survives.

import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";

import { fetchWithGatewayRetry } from "@/lib/media/templates/retry";

import { BrandKitError, classifyBrandKitError } from "./errors";
import {
  parseBrand,
  parseBrandDocumentExtraction,
  parseBrandList,
  parseTemplate,
  parseTemplateList,
} from "./parse";
import type {
  Brand,
  BrandDocumentImport,
  BrandInput,
  BrandKitDoc,
  BrandKitTemplate,
  BrandPatch,
} from "./types";

const adsUrl = (path: string) => `${mediaBaseUrl()}/ads${path}`;

/**
 * Read the body ONCE and throw a classified error for any non-2xx.
 *
 * `res.json()` with a text fallback, because the hop that fails is often not
 * the one that speaks JSON — a CDN's HTML error page must not end up in a
 * user-visible message.
 */
async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    throw new BrandKitError(res.status, classifyBrandKitError(res.status, body));
  }
  return body;
}

/** A brand response that must carry an id to be usable at all. */
function requireBrand(body: unknown): Brand {
  const brand = parseBrand(body as Parameters<typeof parseBrand>[0]);
  if (!brand) throw new Error("brand kit: response carried no brand_id");
  return brand;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates — §3. No tenant of their own: "the templates are authored content,
// identical for every tenant, and contain nothing belonging to anybody." The
// gateway injects one regardless, which is harmless.
// ─────────────────────────────────────────────────────────────────────────────

/** The starter kits to show before the user has a brand of their own. */
export async function listBrandKitTemplates(
  signal?: AbortSignal,
): Promise<BrandKitTemplate[]> {
  const body = await readJson(
    await fetchWithGatewayRetry(
      () => mediaFetch(adsUrl("/brand-kits/templates"), { signal }),
      signal,
    ),
  );
  return parseTemplateList(body as Parameters<typeof parseTemplateList>[0]);
}

export async function getBrandKitTemplate(
  templateId: string,
  signal?: AbortSignal,
): Promise<BrandKitTemplate> {
  const body = await readJson(
    await fetchWithGatewayRetry(
      () =>
        mediaFetch(
          adsUrl(`/brand-kits/templates/${encodeURIComponent(templateId)}`),
          { signal },
        ),
      signal,
    ),
  );
  const template = parseTemplate(body as Parameters<typeof parseTemplate>[0]);
  if (!template) throw new Error("brand kit: template response carried no id");
  return template;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brands
// ─────────────────────────────────────────────────────────────────────────────

/** Every brand this tenant has. */
export async function listBrands(signal?: AbortSignal): Promise<Brand[]> {
  const body = await readJson(
    await fetchWithGatewayRetry(
      () => mediaFetch(adsUrl("/brands"), { signal }),
      signal,
    ),
  );
  return parseBrandList(body as Parameters<typeof parseBrandList>[0]);
}

export async function getBrand(
  brandId: string,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await fetchWithGatewayRetry(
      () =>
        mediaFetch(adsUrl(`/brands/${encodeURIComponent(brandId)}`), { signal }),
      signal,
    ),
  );
  return requireBrand(body);
}

/**
 * Create a brand from a Brand Kit document — §4.
 *
 * The body is the document ITSELF, at the top level and not wrapped. Never
 * retried: this is not idempotent, and a second attempt after an ambiguous
 * failure mints a second brand.
 */
export async function importBrand(
  kit: BrandKitDoc,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await mediaFetch(adsUrl("/brands/import"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kit),
      signal,
    }),
  );
  return requireBrand(body);
}

/**
 * Create a brand from an uploaded .docx / .pptx guideline — §4.
 *
 * MULTIPART, AND DELIBERATELY WITHOUT HEADERS. `mediaFetch` only sets a
 * content-type for a string body, so a FormData body keeps the browser's own
 * `multipart/form-data; boundary=…`. Setting one by hand drops the boundary
 * and the service reads an empty form.
 *
 * Never retried, for the same reason `importBrand` is not: it is not
 * idempotent, and a second attempt after an ambiguous failure mints a second
 * brand — and pays for a second reading of the document.
 *
 * The file's own `type` is not checked here. Browsers report nothing, or
 * `application/octet-stream`, for a .docx often enough that gating on it
 * rejects real uploads; the service decides from the bytes and answers 415.
 */
export async function importBrandDocument(
  file: File,
  options: { name?: string; signal?: AbortSignal } = {},
): Promise<BrandDocumentImport> {
  const form = new FormData();
  form.append("file", file);
  if (options.name?.trim()) form.append("name", options.name.trim());

  const body = await readJson(
    await mediaFetch(adsUrl("/brands/import-document"), {
      method: "POST",
      body: form,
      signal: options.signal,
    }),
  );
  return {
    brand: requireBrand(body),
    extraction: parseBrandDocumentExtraction(body),
  };
}

/**
 * The native shape (§5) — kept as the escape hatch for a caller that would
 * rather not go through a kit document. The editor always imports instead, so
 * that `source_kit` is written.
 */
export async function createBrand(
  input: BrandInput,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await mediaFetch(adsUrl("/brands"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    }),
  );
  return requireBrand(body);
}

/**
 * Partial update — §5. The body must be a DIFF: an omitted key is kept, and an
 * empty one clears. See patch.ts, which is the only thing that should build one.
 */
export async function updateBrand(
  brandId: string,
  patch: BrandPatch,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await mediaFetch(adsUrl(`/brands/${encodeURIComponent(brandId)}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
      signal,
    }),
  );
  return requireBrand(body);
}

/**
 * Replace a brand's whole document, keeping its id.
 *
 * The body is a kit, exactly as `importBrand` posts one — this endpoint IS
 * import, aimed at an existing brand, and it is what makes the kit-only fields
 * writable at all.
 *
 * REPLACE, not merge: an omitted key is cleared, which is the only way to
 * delete a colour or a text style. Hence the whole document, not the diff.
 */
export async function replaceBrandKit(
  brandId: string,
  kit: BrandKitDoc,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await mediaFetch(adsUrl(`/brands/${encodeURIComponent(brandId)}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kit),
      signal,
    }),
  );
  return requireBrand(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// The default brand — which kit a job carries when it says `use_brand` instead
// of naming one. Server-side, so the answer is the same in every browser the
// user opens and survives a cleared localStorage.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The brand a `use_brand` job would actually carry.
 *
 * The SOURCE OF TRUTH for "does this workspace brand its renders, and with
 * what". There is no fallback: a `404` means nobody chose, or somebody
 * un-chose, and owning a brand is not the same as using one.
 *
 * That `404` reaches the caller as a BrandKitError with code `not_found`,
 * because it is an ANSWER rather than a failure — lib/media/defaultBrand.ts
 * reads it as "no brand" and caches it, while treating every other error as
 * "unknown" and caching nothing.
 */
export async function getDefaultBrand(signal?: AbortSignal): Promise<Brand> {
  const body = await readJson(
    await fetchWithGatewayRetry(
      () => mediaFetch(adsUrl("/brands/default"), { signal }),
      signal,
    ),
  );
  return requireBrand(body);
}

/**
 * Choose the brand every `use_brand` job carries from now on.
 *
 * Exclusive on the service side: the flag is cleared from every other brand the
 * tenant owns, so there is never a second answer. Idempotent, which is why it
 * is a PUT — but still NOT retried here, because the rule at the top of this
 * file is "pure GETs only" and a click the user can repeat is not worth an
 * exception to it.
 */
export async function setDefaultBrand(
  brandId: string,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await mediaFetch(adsUrl(`/brands/${encodeURIComponent(brandId)}/default`), {
      method: "PUT",
      signal,
    }),
  );
  return requireBrand(body);
}

/**
 * Withdraw the choice, without turning the brand off.
 *
 * This IS "no brand": afterwards `getDefaultBrand` is a 404 and a `use_brand`
 * job carries nothing. There is no separate switch to turn off, here or on the
 * service — one stored fact, one question it answers.
 */
export async function unsetDefaultBrand(
  brandId: string,
  signal?: AbortSignal,
): Promise<Brand> {
  const body = await readJson(
    await mediaFetch(adsUrl(`/brands/${encodeURIComponent(brandId)}/default`), {
      method: "DELETE",
      signal,
    }),
  );
  return requireBrand(body);
}

/**
 * Remove a brand — 204, or 409 while products still reference it.
 *
 * Deliberately no `res.json()`: a 204 has no body, and reading one as JSON
 * throws on the happy path.
 */
export async function deleteBrand(
  brandId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await mediaFetch(
    adsUrl(`/brands/${encodeURIComponent(brandId)}`),
    { method: "DELETE", signal },
  );
  if (res.ok) return;
  await readJson(res);
}
