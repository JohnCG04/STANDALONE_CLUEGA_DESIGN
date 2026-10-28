/** The three CDP system roles every tenant gets a copy of (mid-platform 000100). */
export type CompanyRoleKind = "admin" | "operator" | "viewer";

/** The system roles' stored names, as mid-platform seeds them. */
const NAME_TO_KIND: Record<string, CompanyRoleKind> = {
  "cdp administrator": "admin",
  "cdp operator": "operator",
  "cdp viewer": "viewer",
};

/**
 * Which system role this is, or null for a role a tenant made itself.
 *
 * Read from the slug first: the template's is the bare `admin` / `operator` /
 * `viewer`, and a tenant's own copy is `ovr-<tenant>-<slug>` (mid-platform
 * 000224). The name is the fallback, for surfaces like the Team Directory that
 * receive only the name.
 */
export function companyRoleKind(role: { slug?: string | null; name?: string | null }): CompanyRoleKind | null {
  const slug = (role.slug ?? "").trim().toLowerCase();
  const fromSlug = /^(?:ovr-[0-9a-z]+-)?(admin|operator|viewer)$/.exec(slug)?.[1];
  if (fromSlug) return fromSlug as CompanyRoleKind;
  return NAME_TO_KIND[(role.name ?? "").trim().toLowerCase()] ?? null;
}

/**
 * The role's name in the reader's language.
 *
 * The stored names are English and carry the internal product code
 * ("CDP Administrator"), which nobody using Cluega knows as "CDP". The system
 * roles read as `settings.team.companyRoles.<kind>.name`; a tenant's own role
 * keeps the name its administrator gave it.
 */
export function companyRoleLabel(
  role: { slug?: string | null; name?: string | null },
  t: (key: string) => string,
): string {
  const kind = companyRoleKind(role);
  return kind ? t(`settings.team.companyRoles.${kind}.name`) : (role.name ?? "").trim();
}

/**
 * One line on what the role can do, or the tenant's own description.
 *
 * Written against what the backend actually enforces today — the ad-change key
 * (000265), account settings (000223) and tenant administration (000229) — and
 * not against the contacts / segments / export keys, which are in the catalogue
 * but checked nowhere. A description promising those would be untrue.
 */
export function companyRoleDescription(
  role: { slug?: string | null; name?: string | null; description?: string | null },
  t: (key: string) => string,
): string {
  const kind = companyRoleKind(role);
  return kind ? t(`settings.team.companyRoles.${kind}.description`) : (role.description ?? "").trim();
}
