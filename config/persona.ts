/**
 * The assistant-persona feature gate.
 *
 * Mirrors the backend's `PERSONA_ENABLED`, which defaults to false and must
 * change NOTHING observable while it is off. The browser cannot read that
 * variable, so the frontend carries its own `NEXT_PUBLIC_` twin — turbo.json
 * already passes every `NEXT_PUBLIC_*` through to the build, so no allowlist
 * entry is needed.
 *
 * Why a flag rather than gating on the data: the persona controls live in the
 * FIRST-RUN personalization wizard, where the stored profile is still null, so
 * "render it only if the profile came back with the field" would hide it from
 * exactly the users the wizard exists for. The flag is the only gate that is
 * correct on turn one.
 *
 * Same shape as [my-browser.ts](my-browser.ts): strictly `=== "true"`, because
 * the Dockerfile turns every unset `NEXT_PUBLIC_*` build arg into an empty
 * string rather than leaving it undefined.
 */
export const personaConfig = {
  enabled: process.env.NEXT_PUBLIC_PERSONA_ENABLED === "true",
} as const;

export function isPersonaFeatureEnabled(): boolean {
  return personaConfig.enabled;
}
