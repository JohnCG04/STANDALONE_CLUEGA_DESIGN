import {
  RELIGHT_ELEVATION_RANGE,
  RELIGHT_INTENSITY_RANGE,
  RELIGHT_LIGHT_DEFAULTS,
  RELIGHT_MAX_LIGHTS,
  RELIGHT_ROTATE_RANGE,
  effectiveRelightSettings,
  relightPromptFor,
  type GenAudioRequest,
  type RelightLight,
  type RelightLightSpec,
  type RelightRequest,
} from "@dogclaw-ad/workflow";
import { resolveMediaUrl } from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { assertPubliclyFetchable, toImageAssets } from "../../shared/helpers";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";

/** The lane's one knob, in the job's `options`: a voice for speech, a length otherwise. */
export function audioOptions(req: GenAudioRequest): Record<string, unknown> {
  const options: Record<string, unknown> = { kind: req.lane };
  const voice = req.params?.voice;
  if (req.lane === "voice" && typeof voice === "string" && voice.trim()) {
    options.voice = voice.trim();
  }
  const seconds = Number(req.params?.seconds);
  if (req.lane !== "voice" && Number.isFinite(seconds) && seconds > 0) {
    options.seconds = Math.round(seconds);
  }
  return options;
}

/** The wired track as a url media-ai can fetch; it reads the file server-side. */
export function speechInput(audio: { url?: string } | undefined, feature: string): string {
  const url = audio?.url ? toJobInputUrl(audio.url) : "";
  if (!url) throw new Error(MEDIA_JOB_MESSAGES.noSpeechInput(feature));
  // Before the job burns a submit: an in-browser bake hands out blob: urls media-ai can't read.
  assertPubliclyFetchable([url], feature);
  return url;
}

/** Same-origin, so the editor can read the pixels it bakes. */
export const proxied = (url: string) => toImageAssets([resolveMediaUrl(url)])[0].url;

function normalizeColor(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1]?.toLowerCase();
  if (!hex) return RELIGHT_LIGHT_DEFAULTS.color;
  return `#${hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex}`;
}

function snap(
  value: unknown,
  range: { min: number; max: number; step: number },
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  const v = value === undefined || value === null || value === "" || !Number.isFinite(n) ? fallback : n;
  const stepped = Math.round(v / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, stepped));
}

function withIds(lights: RelightLightSpec[]): RelightLight[] {
  return lights.map((light, i) => ({ id: `light-${i + 1}`, ...light }));
}

/** The Relight node's light rig, normalized for a PROMPT-DRIVEN backend. */
export function normalizeRelightLights(req: RelightRequest): RelightLightSpec[] {
  const params = req.params ?? {};
  const raw = req.lights?.length
    ? req.lights
    : Array.isArray(params.lights)
      ? (params.lights as Partial<RelightLight>[])
      : undefined;

  const { lights } = effectiveRelightSettings({
    lights: raw?.length ? withIds(raw as RelightLightSpec[]) : undefined,
    // Only read when `lights` is absent — see `effectiveRelightSettings`.
    rotate: params.rotate as number | undefined,
    elevation: params.elevation as number | undefined,
    intensity: params.intensity as number | undefined,
    color: params.color as string | undefined,
  });

  return lights.slice(0, RELIGHT_MAX_LIGHTS).map((light) => ({
    color: normalizeColor(light.color),
    rotate: snap(light.rotate, RELIGHT_ROTATE_RANGE, RELIGHT_LIGHT_DEFAULTS.rotate),
    elevation: snap(
      light.elevation,
      RELIGHT_ELEVATION_RANGE,
      RELIGHT_LIGHT_DEFAULTS.elevation,
    ),
    intensity: snap(
      light.intensity,
      RELIGHT_INTENSITY_RANGE,
      RELIGHT_LIGHT_DEFAULTS.intensity,
    ),
  }));
}

function rigSpec(lights: RelightLightSpec[]): string {
  return lights
    .map(
      (l, i) =>
        `${i + 1}) ${l.color} · azimuth ${l.rotate}° · elevation ${l.elevation}° · intensity ${l.intensity}/10`,
    )
    .join("; ");
}

export function relightPrompt(
  req: RelightRequest,
  lights: RelightLightSpec[],
  hasLightTransfer: boolean,
): string {
  const prose =
    req.prompt?.trim() ||
    relightPromptFor({ lights: withIds(lights) }, { hasLightTransfer });
  const order = hasLightTransfer
    ? "\nInput image 1 is the picture to relight; input image 2 only supplies the lighting to match — never copy its subject, framing or content."
    : "";
  return `${prose}\n\nLight rig, azimuth 0° = straight in front of the subject, positive elevation = above it: ${rigSpec(lights)}.${order}`;
}

/** A non-empty trimmed string, or nothing. */
export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
