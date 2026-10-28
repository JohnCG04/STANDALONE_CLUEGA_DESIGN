// Video generation runs on the SAME Media Service as image generation, reached
// through the same CDP gateway (/api/v1/media/*). It only differs in transport:
// video uses GET /jobs/{id}/stream + polling instead of /chat. So it reuses the
// image base URL + CDP auth headers verbatim.
import { mediaBaseUrl, mediaHeaders, resolveMediaUrl } from "./api.helper";

// Video shares the media auth-aware fetch (401 → refresh → retry). Re-exported
// as `videoFetch` for symmetry with `videoBaseUrl`/`videoHeaders`.
export { mediaFetch as videoFetch } from "./api.helper";

export function videoBaseUrl() {
  return mediaBaseUrl();
}

export function videoHeaders(accept: string) {
  return mediaHeaders(accept);
}

export function resolveVideoUrl(value: string) {
  return resolveMediaUrl(value);
}
