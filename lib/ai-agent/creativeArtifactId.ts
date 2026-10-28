/**
 * Media-library artifact id plumbing for AI-generated ad creatives.
 *
 * The workflow report attributes an ad to the AI creative it was built from via
 * `creative_ids` — the media-library artifact ids that `POST
 * /api/v1/workflow/creative/upload` records on the run (`artifact_id` in its
 * body). The platform-side `video_id`/`image_id` is NOT that id, so whenever an
 * AI-produced creative travels from the generator to the ad builder its artifact
 * id has to travel with it; a dropped id silently yields an empty `creative_ids`
 * on every report event (the backend ignores a blank artifact_id by design).
 *
 * Both helpers here are pure so the two hops that used to lose the id — reading
 * it off a media-gen job result, and choosing which id belongs to the creative
 * the user confirmed — are covered by tests.
 */

/** A media-gen job result in any of the envelopes the media service returns. */
type JobResultLike =
  | {
      output_refs?: unknown;
      data?: JobResultLike;
      result?: JobResultLike;
      // The media service returns many sibling fields (output_urls, tool_id, …) that
      // this reader ignores; accepted so a caller can pass the result verbatim.
      [key: string]: unknown;
    }
  | null
  | undefined;

/** A ref that is really a display url/path, not a library id (see artifactUrl). */
function isUrlLikeRef(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("/");
}

/** First entry of `key` that is an opaque library ref (not a display url). */
function refFrom(result: Record<string, unknown>, key: string): string {
  const refs = result[key];
  if (!Array.isArray(refs)) return "";
  const ref = typeof refs[0] === "string" ? refs[0].trim() : "";
  return ref && !isUrlLikeRef(ref) ? ref : "";
}

/**
 * The media-library artifact id of a finished media-gen job, or "" when the job
 * carries none.
 *
 * Reads `output_refs` first, then the URL-only protocol's `video_ids`/`image_ids`
 * (there the loadable url lives in `*_urls` and the opaque `art_*` ref in `*_ids`
 * — see resolveDisplayUrl in mediaImageClient), and recurses into the `data` /
 * `result` envelopes the media service wraps results in. A url-shaped ref is
 * rejected: some payloads put a display url in those fields, and a url is not an
 * id the media library can resolve.
 */
export function extractJobArtifactId(result: JobResultLike): string {
  if (!result || typeof result !== "object") return "";
  const body = result as Record<string, unknown>;
  return (
    refFrom(body, "output_refs")
    || refFrom(body, "video_ids")
    || refFrom(body, "image_ids")
    || extractJobArtifactId((result as { data?: JobResultLike }).data)
    || extractJobArtifactId((result as { result?: JobResultLike }).result)
  );
}

/**
 * `{url: artifactId}` for a set of media urls and their index-aligned library refs.
 *
 * The canvas keys everything it knows by DISPLAY URL (see useCanvasSessions), but
 * media produced outside it — a chat turn's generated images, the ad builder's
 * preview — arrives as bare urls. Without this map the canvas has no library id
 * for them, so a video generated FROM such an image reports an empty
 * `source_artifact_id` and the run's report loses the source image (live run
 * 6c4279c9, 2026-07-27).
 *
 * Pairing is positional and only trusted when both lists are the same length —
 * the same `refsAligned` rule the media session store applies. A partial refs list
 * cannot be positionally matched, and a wrong pairing would attribute an ad to
 * another creative, so it yields nothing instead. Url-shaped refs are display urls,
 * not ids (same rejection as `extractJobArtifactId`).
 */
export function artifactIdsByUrl(
  urls: string[] | undefined,
  refs: string[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!urls?.length || !refs?.length || urls.length !== refs.length) return out;
  urls.forEach((url, i) => {
    const key = (url ?? "").trim();
    const ref = (refs[i] ?? "").trim();
    if (!key || !ref || isUrlLikeRef(ref)) return;
    if (!out[key]) out[key] = ref;
  });
  return out;
}

/** A conversation turn as far as artifact mapping cares: its media + their refs. */
export type ArtifactTurn = {
  imageUrls?: string[];
  imageRefs?: string[];
};

/**
 * The merged `{url: artifactId}` map for a whole conversation, so seeding the canvas
 * from a session carries every turn's library ids with it. First mapping wins: a url
 * re-listed by a later turn keeps the id it was first generated with.
 */
export function artifactIdsFromTurns(
  turns: readonly ArtifactTurn[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const turn of turns ?? []) {
    for (const [url, ref] of Object.entries(
      artifactIdsByUrl(turn?.imageUrls, turn?.imageRefs),
    )) {
      if (!out[url]) out[url] = ref;
    }
  }
  return out;
}

/**
 * Metadata the canvas "Use for Ad" button hands to its host flow alongside the
 * media url. Declared once here (instead of inline per prop) so the artifact id
 * cannot be dropped again by one hop of the chain drifting from the others.
 */
export type ExposedMediaMeta = {
  mediaType?: "image" | "video";
  title?: string;
  /** Media-library id — present only for AI-generated media. */
  artifactId?: string;
  /** For a generated video: the artifact id of the image it was generated from. */
  sourceArtifactId?: string;
};

export type ExposedCreativePick = {
  url: string;
  /** Set only when the exposed media came from an AI generation job. */
  artifactId?: string;
  /** For a generated video: the artifact id of its source image. */
  sourceArtifactId?: string;
} | null | undefined;

/**
 * The `artifact_id` the creative/upload body must carry for the creative the
 * user just confirmed, or undefined when the pick is not AI-generated (an
 * account/library video, a device upload) and therefore has no library id.
 *
 * `exposed` is the "Use for Ad" pick handed over from the media panel and
 * `generatedByUrl` maps the ad builder's OWN generated media urls to their
 * artifact ids. The exposed id is honored only when it belongs to the chosen
 * url: that pick is deliberately kept alive after its panel closes, so matching
 * on the url keeps a stale pick from attributing an ad to the wrong creative.
 */
export function pickCreativeArtifactId(params: {
  chosenUrl: string;
  exposed: ExposedCreativePick;
  generatedByUrl: Record<string, string>;
}): string | undefined {
  const { chosenUrl, exposed, generatedByUrl } = params;
  const fromExposed =
    exposed && exposed.url === chosenUrl ? (exposed.artifactId ?? "").trim() : "";
  return fromExposed || generatedByUrl[chosenUrl] || undefined;
}

/**
 * The source-image artifact id to report alongside the creative, or undefined when
 * the creative was not generated from a canvas image.
 *
 * Same url-match rule as pickCreativeArtifactId: a stale "Use for Ad" pick must
 * never lend its source image to a different creative.
 */
export function pickCreativeSourceArtifactId(params: {
  chosenUrl: string;
  exposed: ExposedCreativePick;
}): string | undefined {
  const { chosenUrl, exposed } = params;
  if (!exposed || exposed.url !== chosenUrl) return undefined;
  return (exposed.sourceArtifactId ?? "").trim() || undefined;
}
