/**
 * Storage figures in the Library — sizes, the meter, plan allowances
 * (LIB2-013, storage rules Rule 2).
 *
 * **Binary units, with a round terabyte**: 1 KB = 2^10 B, 1 MB = 2^20 B,
 * 1 GB = 2^30 B, and 1 TB = 1,000 GB so the plan numbers stay round (Enterprise
 * 10 is "2 TB", which is 2,000 GB). The Library's list, the storage meter, the
 * breakdown and the plan limits all use this one definition, so the sizes on
 * screen add up to the meter and the meter agrees with the bill. The backend's
 * twin is `domain.BytesPerGB` / `domain.GBPerTB` in BACKEND_CLUEGA_CDP.
 *
 * Kept apart from `formatBytes` (lib/format/bytes.ts), which stays decimal for
 * the rest of the app — chat file cards, Pulse, settings — where sizes are
 * compared with what the operating system reports, and whose tests pin that.
 *
 * Zero/invalid returns an empty string, like `formatBytes`, so each caller
 * picks its own placeholder.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** How many of a unit make the next one: KB, MB and GB are binary; TB is 1,000 GB. */
const STEP = [1024, 1024, 1024, 1000] as const;

const ONE_DECIMAL = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const UP_TO_ONE_DECIMAL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function scale(bytes: number): { value: number; unit: number } {
  let value = bytes;
  let unit = 0;
  // Up a unit from 1,000, not from the step: "1,010 KB" is never written.
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= STEP[unit];
    unit += 1;
  }
  // 999.96 KB would print as "1,000.0 KB": carry it up.
  if (Math.round(value * 10) / 10 >= 1000 && unit < UNITS.length - 1) {
    value /= STEP[unit];
    unit += 1;
  }
  return { value, unit };
}

/**
 * A measured size — a file, a folder, what the workspace uses. One decimal
 * below 100, kept even when it is zero, so a file of exactly 2^30 bytes reads
 * "1.0 GB" and a row's figure is its bytes ÷ 2^20 to one decimal (LIB2-013).
 */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const { value, unit } = scale(bytes);
  // Whole bytes never carry a fraction: "537 B", never "536.9 B".
  const formatter = unit === 0 || value >= 100 ? WHOLE : ONE_DECIMAL;
  return `${formatter.format(value)} ${UNITS[unit]}`;
}

/**
 * An allowance — a plan's capacity or a per-file limit. Same units, but a round
 * number stays round: "20 GB", "25 MB", "2 TB", never "20.0 GB".
 */
export function formatStorageAllowance(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const { value, unit } = scale(bytes);
  const formatter = unit === 0 || value >= 100 ? WHOLE : UP_TO_ONE_DECIMAL;
  return `${formatter.format(value)} ${UNITS[unit]}`;
}
