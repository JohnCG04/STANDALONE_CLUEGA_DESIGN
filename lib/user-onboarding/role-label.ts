/**
 * The label for the role a person picked during onboarding.
 *
 * The stored value is an option id (`performance_marketer`), shown through
 * `userOnboarding.options.role.<id>`. The form also lets a person type a role of
 * their own, which no locale file has a key for; `t()` answers a miss with the
 * key itself, so a miss falls back to the typed text. Empty means "never
 * answered" and stays empty for the caller's placeholder.
 */
export function roleLabel(role: string | null | undefined, t: (key: string) => string): string {
  const value = (role ?? "").trim();
  if (!value) return "";
  const key = `userOnboarding.options.role.${value}`;
  const label = t(key);
  return label === key ? value : label;
}
