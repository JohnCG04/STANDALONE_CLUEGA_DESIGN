import {
  listBrands,
  type Brand,
} from "@/lib/media/brandKit";

let brands: Brand[] = [];
let inFlight: Promise<Brand[]> | null = null;

/**
 * The in-memory catalogue shared by the composer and generated-media cards.
 * Loading the catalogue is deliberately separate from React so a restored
 * message can name the brand that was applied without starting another request.
 */
export function loadedBrands(): readonly Brand[] {
  return brands;
}

/** Load the tenant's brands once per session. A failed optional catalogue must
 * never block image generation, so callers receive an empty list on failure. */
export function primeBrands(signal?: AbortSignal): Promise<Brand[]> {
  if (inFlight) return inFlight;

  inFlight = listBrands(signal)
    .then((next) => {
      brands = next;
      return brands;
    })
    .catch(() => {
      brands = [];
      return brands;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Keep the live catalogue in sync after Brand Kit creates or updates a brand. */
export function rememberBrand(brand: Brand): void {
  brands = [
    brand,
    ...brands.filter((candidate) => candidate.brand_id !== brand.brand_id),
  ];
}

/**
 * Drop a brand the tenant deleted.
 *
 * Nothing in this catalogue has ever shrunk — it only grows (`rememberBrand`)
 * or is replaced wholesale (`primeBrands`) — because until the Brand Kit gained
 * a list, nothing could delete a brand. Without this the composer's pill keeps
 * offering one that 404s on the next job.
 */
export function forgetBrand(brandId: string): void {
  brands = brands.filter((candidate) => candidate.brand_id !== brandId);
}

/**
 * Seed the catalogue from a list somebody else already fetched.
 *
 * The Brand Kit list asks react-query for exactly the request `primeBrands`
 * makes. Handing the answer over keeps that ONE `GET /ads/brands` instead of
 * two, and closes the window where the pill and the list disagree.
 */
export function primeBrandsFrom(next: readonly Brand[]): void {
  brands = [...next];
}

/**
 * Forget everything on a team switch.
 *
 * A brand belongs to exactly one tenant and this catalogue has no team in it,
 * so a switch would otherwise leave the previous tenant's brands on offer —
 * and `X-Team-Id` has already changed, so refetching them would 404.
 */
export function resetBrands(): void {
  brands = [];
  inFlight = null;
}
