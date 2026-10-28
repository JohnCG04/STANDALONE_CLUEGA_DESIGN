/**
 * Label for one stored onboarding option value.
 *
 * Stored values are opaque ids (`constants/onboarding-options.ts`) whose labels
 * live under `onboarding.options.<group>.<value>` — EXCEPT the free-text ones a
 * user typed into "Industry" or "How did you hear about us", which are stored
 * verbatim and have no key at all.
 *
 * `t()` answers a missing key with the key path itself, so "the lookup returned
 * exactly what I asked for" is the signal that there was no translation, and the
 * raw value is the label. That rule lived inline in the wizard twice before the
 * Settings summary needed it a third time.
 */
export type OnboardingOptionGroup =
  | "industry"
  | "marketingGoal"
  | "channel"
  | "hearAboutUs";

export function onboardingOptionLabel(
  t: (path: string) => string,
  group: OnboardingOptionGroup,
  value: string,
): string {
  const key = `onboarding.options.${group}.${value}`;
  const label = t(key);
  return label === key ? value : label;
}
