/**
 * The one place a byte count becomes a string a person reads.
 *
 * **Decimal units** (1 MB = 1,000,000 B), because every number the user can check
 * this against is decimal: macOS Finder, iOS, Android, the browser's download
 * list. The app used to divide by 1024 and still write "MB", so a video Finder
 * called 25.8 MB showed as 25 MB — 4.6% short, and sitting exactly on the
 * "25.0 MB per file" upload limit, which made a file that uploads fine look like
 * it was at the ceiling.
 *
 * **One decimal below 100**, dropped when it is zero (`3 MB`, not `3.0 MB`).
 * Rounding to whole numbers is what hid the discrepancy in the first place:
 * 24.6 became "25".
 *
 * Allowances follow the same rule, which is why the storage plan itself is now
 * decimal: `DefaultTenantStorageBytes` in BACKEND_CLUEGA_CDP was 2^40 B and the
 * meter therefore read "1.1 TB" for a plan sold as 1 TB (LIB-055). The constant
 * moved to 1e12; this formatter did not change, so every size on screen still
 * matches what the OS reports about the same file.
 *
 * Zero/invalid returns an empty string so each caller can pick its own placeholder
 * ("—" in a table, nothing at all in a chip) instead of every surface inheriting
 * a "0 MB" that means "unknown".
 */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

const DECIMAL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // 999,999 B is 999.999 KB, which would print as "1,000 KB": carry it up.
  if (Math.round(value) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  // Whole bytes never carry a fraction: "537 B", never "536.9 B".
  const formatter = unit === 0 || value >= 100 ? WHOLE : DECIMAL;
  return `${formatter.format(value)} ${UNITS[unit]}`;
}
