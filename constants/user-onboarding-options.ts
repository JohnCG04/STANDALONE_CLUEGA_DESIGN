// Per-user onboarding (personalization) option registry.
//
// SINGLE source of truth for the selectable values in the per-user personalization
// form. Values are stable, opaque ids — the backend stores and renders them
// verbatim and never branches on them, so adding a new option is a one-line entry
// here plus its label in each i18n `user-onboarding.json`. No option label or
// business rule is hardcoded in component JSX.
//
// Labels are resolved at runtime via i18n keys
// `userOnboarding.options.<group>.<value>` so every label is localized.

export type UserOnboardingOption = { value: string };

// ROLE_OPTIONS — the person's job function. Single-select (drives how the agent
// frames its help). `allowCustom` in the form lets a user type an unlisted role.
export const ROLE_OPTIONS: readonly UserOnboardingOption[] = [
  { value: "founder_owner" },
  { value: "marketing_manager" },
  { value: "performance_marketer" },
  { value: "content_creator" },
  { value: "designer" },
  { value: "data_analyst" },
  { value: "agency_account" },
  { value: "ecommerce_operator" },
  { value: "sales" },
  { value: "other" },
] as const;

// USER_GOAL_OPTIONS — what this person personally wants to get done. Multi-select.
export const USER_GOAL_OPTIONS: readonly UserOnboardingOption[] = [
  { value: "launch_campaigns" },
  { value: "optimize_performance" },
  { value: "create_content" },
  { value: "analyze_reporting" },
  { value: "manage_audiences" },
  { value: "automate_workflows" },
  { value: "learn_platform" },
] as const;

/**
 * HONORIFIC_OPTIONS — how the assistant should ADDRESS this person. Single-select.
 *
 * A preference, not a demographic: nothing here asks for or infers gender, and
 * the stored value is the address word itself, so the only thing the assistant
 * learns is which word to open a sentence with. `name_only` is the opt-out —
 * "use my name, no address word" — which is why the set is closed and the form
 * passes no `allowCustom`: a typed-in value would be pasted verbatim into every
 * reply the assistant writes.
 */
export type Honorific = "anh" | "chi" | "ban" | "name_only";

export const HONORIFIC_OPTIONS: readonly { value: Honorific }[] = [
  { value: "anh" },
  { value: "chi" },
  { value: "ban" },
  { value: "name_only" },
] as const;
