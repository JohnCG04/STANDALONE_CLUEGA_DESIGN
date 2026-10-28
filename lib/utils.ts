import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Constrain `value` to [min, max]. Defaults to the 0..1 range the scroll-driven
 * sections use, which is what most callers wanted.
 *
 * Lived as eight identical copies before — seven in landing's scroll sections, one
 * in the canvas toolbar. Four other `clamp`s in the repo are deliberately NOT this
 * one: they round, take a 2-argument form, hardcode 0..100, or resolve a range
 * object with a fallback. Those stay where they are.
 */
export function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Non-cryptographic, sortable-by-time unique id: `<prefix><base36 time>-<random suffix>`.
 * Five call sites hand-rolled this same `Date.now()/Math.random()` shape before.
 */
export function randomId(prefix = "", randomLength = 8) {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 2 + randomLength)}`;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
