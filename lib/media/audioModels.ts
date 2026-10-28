import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";

// GET /models/audio — the TTS/music catalog plus the flat list of voice ids the
// speech models accept. The avatar studio's voice dropdown reads `voices` from
// here; there is deliberately no /avatars/voices endpoint to invent.

export type AudioModelOption = {
  id: string;
  name: string;
  displayName: string;
};

export type AudioModelsCatalog = {
  tts: AudioModelOption[];
  music: AudioModelOption[];
  /** e.g. ["alloy","echo","fable","onyx","nova","shimmer"] */
  voices: string[];
};

type AudioModelWire = {
  id?: string;
  name?: string;
  display_name?: string;
};

type AudioModelsWire = {
  tts?: AudioModelWire[];
  music?: AudioModelWire[];
  voices?: string[];
};

function toOption(row: AudioModelWire): AudioModelOption {
  return {
    id: row.id ?? "",
    name: row.name ?? row.id ?? "",
    displayName: row.display_name ?? row.name ?? row.id ?? "",
  };
}

export async function listAudioModels(
  signal?: AbortSignal,
): Promise<AudioModelsCatalog> {
  const res = await mediaFetch(`${mediaBaseUrl()}/models/audio`, { signal });
  if (!res.ok) throw new Error(`audio models failed: ${res.status}`);

  const body = (await res.json().catch(() => null)) as AudioModelsWire | null;
  return {
    tts: (body?.tts ?? []).filter((row) => row.id).map(toOption),
    music: (body?.music ?? []).filter((row) => row.id).map(toOption),
    voices: (body?.voices ?? []).filter(Boolean),
  };
}

/** One `/models/audio` row as the service sent it: per-model `voices`, `durations`, … */
export type AudioModelRow = AudioModelWire & Record<string, unknown>;

/** Each lane's rows, unparsed, for a picker that maps them itself (the workflow editor). */
export type AudioModelLanes = {
  tts: AudioModelRow[];
  music: AudioModelRow[];
  sfx: AudioModelRow[];
};

/** The same catalog `listAudioModels` reads, every lane kept whole (that one drops `sfx`). */
export async function listAudioModelLanes(
  signal?: AbortSignal,
): Promise<AudioModelLanes> {
  const res = await mediaFetch(`${mediaBaseUrl()}/models/audio`, { signal });
  if (!res.ok) throw new Error(`audio models failed: ${res.status}`);

  const body = (await res.json().catch(() => null)) as Partial<
    Record<keyof AudioModelLanes, AudioModelRow[]>
  > | null;
  const lane = (rows?: AudioModelRow[]) => (rows ?? []).filter((row) => row?.id);
  return { tts: lane(body?.tts), music: lane(body?.music), sfx: lane(body?.sfx) };
}
