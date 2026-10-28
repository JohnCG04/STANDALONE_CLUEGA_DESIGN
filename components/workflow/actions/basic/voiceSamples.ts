import type { VoiceSample } from "@dogclaw-ad/workflow";
import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import type { VoiceSampleWire } from "./types";

// One blob per sample path for the session: every ElevenLabs model shares the same files.
const sampleUrls = new Map<string, Promise<string>>();

/** Fetched once and played from a blob: url, since an `<audio src>` can't send the bearer. */
function loadSample(path: string): Promise<string> {
  let pending = sampleUrls.get(path);
  if (!pending) {
    pending = mediaFetch(`${mediaBaseUrl()}${path}`, {}, "audio/mpeg").then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Voice sample request failed (${response.status})`);
        }
        return URL.createObjectURL(await response.blob());
      },
    );
    sampleUrls.set(path, pending);
    // A failed download is forgotten, so pressing play again retries it.
    pending.catch(() => sampleUrls.delete(path));
  }
  return pending;
}

/** `GET /models/audio/voices?model=`: names only; each bundled sample downloads on first play. */
export async function listVoiceSamples(model: string): Promise<VoiceSample[]> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(MEDIA_JOB_MESSAGES.notConfigured);
  const response = await mediaFetch(
    `${baseUrl}/models/audio/voices?model=${encodeURIComponent(model)}`,
  );
  if (!response.ok) {
    throw new Error(`Voice samples request failed (${response.status})`);
  }
  const payload = (await response.json()) as { voices?: VoiceSampleWire[] };
  return (payload.voices ?? []).flatMap((voice) => {
    if (!voice?.id) return [];
    const path = voice.sample_url;
    return [
      {
        id: voice.id,
        name: voice.name || voice.id,
        ...(path ? { loadSample: () => loadSample(path) } : {}),
      },
    ];
  });
}
