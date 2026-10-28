import { NextResponse } from "next/server";

import {
  CURATED_FONT_FAMILIES,
  type FontCatalogue,
} from "@/lib/media/brandFonts";

/**
 * The Font field's catalogue, from Google's library.
 *
 * Proxied because the Developer API wants a key and a key in client code is a
 * public key. Cached a day at both hops — the library moves monthly.
 *
 * WITHOUT A KEY it still answers, with the curated list. A dev machine and an
 * unconfigured deployment are the same case, and a Font field offering nothing
 * is worse than one offering fourteen families.
 */
export const runtime = "nodejs";

const CACHE_SECONDS = 24 * 60 * 60;

const CURATED: FontCatalogue = {
  families: CURATED_FONT_FAMILIES,
  source: "curated",
};

type WebfontList = { items?: { family?: unknown }[] };

export async function GET() {
  const key = process.env.GOOGLE_FONTS_API_KEY;
  if (!key) return answer(CURATED);

  try {
    const upstream = await fetch(
      `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${encodeURIComponent(key)}`,
      { next: { revalidate: CACHE_SECONDS } },
    );
    if (!upstream.ok) return answer(CURATED);

    const body = (await upstream.json()) as WebfontList;
    const families = (body.items ?? [])
      .map((item) => item.family)
      .filter((family): family is string => typeof family === "string" && family !== "");

    // An empty list from a 200 means the shape changed under us.
    return answer(families.length > 0 ? { families, source: "google" } : CURATED);
  } catch {
    // Offline, DNS, timeout — all the same downstream.
    return answer(CURATED);
  }
}

function answer(catalogue: FontCatalogue) {
  return NextResponse.json(catalogue, {
    headers: {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
    },
  });
}
