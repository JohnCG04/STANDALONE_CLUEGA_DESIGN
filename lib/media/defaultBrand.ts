/**
 * Does this workspace brand its renders, and with what?
 *
 * ONE question, answered by the SERVICE — `GET /ads/brands/default`, which is
 * `200` with the chosen brand or `404` when nobody chose. Not by localStorage,
 * which is what this module replaced: a switch kept in one browser is one the
 * user's other machine never sees, that a teammate cannot change, and that
 * disagrees with the render the moment either happens. `PUT` and `DELETE` on
 * `/ads/brands/{id}/default` are the only writers.
 *
 * Cached in memory for the same reason `brandSelection.ts` caches the
 * catalogue: the submit path reads this OUTSIDE React, and a request per job
 * would put a network round trip in front of every generation. The cache is
 * primed once per session, updated by the writes that go through here, and
 * dropped on a team switch.
 *
 * `null` is a real cached answer ("no brand"), which is why `undefined` is the
 * separate "not asked yet" state. Anything that reads the cache without
 * awaiting must treat the two differently — see `brandOnJobs`.
 */

import {
  getDefaultBrand,
  setDefaultBrand as putDefaultBrand,
  unsetDefaultBrand,
  BrandKitError,
  type Brand,
} from "@/lib/media/brandKit";

/** `undefined` = never asked. `null` = asked, and the answer is "no brand". */
let current: Brand | null | undefined;
let inFlight: Promise<Brand | null> | null = null;

/** The cached answer, without asking. `undefined` until something has. */
export function loadedDefaultBrand(): Brand | null | undefined {
  return current;
}

/**
 * Ask the service once per session, and hand every later caller the answer.
 *
 * A 404 is not a failure — it IS the answer, and the only one that means "this
 * workspace generates unbranded". Every other failure resolves `null` too, so
 * an outage degrades to an unbranded render rather than a blocked submit, but
 * it is NOT cached: `current` stays `undefined` so the next call asks again.
 */
export function primeDefaultBrand(signal?: AbortSignal): Promise<Brand | null> {
  if (current !== undefined) return Promise.resolve(current);
  if (inFlight) return inFlight;

  inFlight = getDefaultBrand(signal)
    .then((brand) => {
      current = brand;
      return current;
    })
    .catch((cause) => {
      if (cause instanceof BrandKitError && cause.code === "not_found") {
        current = null;
        return current;
      }
      // Left uncached on purpose. A 502 is not "no brand", and answering every
      // later job with one would turn a blip into a session of unbranded work.
      return null;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Whether the next job carries a brand — the check the submit path makes.
 *
 * Async, and it has to be: the answer lives on the service. It is one awaited
 * cache read after the first call, and the first call is a request the page
 * would have made anyway to draw the brand pill.
 */
export async function brandOnJobs(signal?: AbortSignal): Promise<boolean> {
  return (await primeDefaultBrand(signal)) !== null;
}

/** Choose the brand this workspace renders under. */
export async function chooseDefaultBrand(brandId: string): Promise<Brand> {
  const brand = await putDefaultBrand(brandId);
  current = brand;
  return brand;
}

/**
 * Say "no brand" — the other half of choosing one.
 *
 * Takes the id because the service clears a CHOSEN brand rather than a tenant
 * setting; there is nothing to clear when nothing is chosen, which is why the
 * cache is enough to skip the request.
 */
export async function clearDefaultBrand(): Promise<void> {
  const chosen = await primeDefaultBrand();
  if (!chosen) return;
  await unsetDefaultBrand(chosen.brand_id);
  current = null;
}

/**
 * Take a brand a write elsewhere already resolved.
 *
 * The Brand Kit list and the editor both set the default through their own
 * request; handing the answer over keeps this cache from being the one stale
 * copy in the app.
 */
export function rememberDefaultBrand(brand: Brand | null): void {
  current = brand;
}

/**
 * Forget the answer a brand was deleted out from under.
 *
 * The service does not promote a replacement, so the honest cached value after
 * deleting the chosen brand is "no brand" — and re-asking would be a request
 * for something this client can already work out.
 */
export function forgetDefaultBrandIfDeleted(brandId: string): void {
  if (current && current.brand_id === brandId) current = null;
}

/**
 * Drop everything on a team switch.
 *
 * A brand belongs to exactly one tenant and this cache has no team in it, so a
 * switch would otherwise answer the new workspace with the old one's brand —
 * and `X-Team-Id` has already changed, so that brand is a 404 there.
 */
export function resetDefaultBrand(): void {
  current = undefined;
  inFlight = null;
}
