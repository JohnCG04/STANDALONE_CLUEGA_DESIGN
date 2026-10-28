import type { WidgetSlot } from "@/components/dashboard/widgets/types";

/**
 * A slot's `config` as a record — `{}` when the slot carries none (or something
 * that is not an object). The one reading every module of the board uses, so no
 * caller guards `slot.config` on its own.
 */
export function slotConfig(slot: WidgetSlot): Record<string, unknown> {
  const config = slot.config;
  return config && typeof config === "object" ? (config as Record<string, unknown>) : {};
}
