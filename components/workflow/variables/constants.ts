import type { AssetSource } from "@/lib/cdp/assetsClient";

/** Backend caps, mirrored so the picker can stop before the server refuses. */
export const MAX_VARIABLE_ITEMS = 20;
export const MAX_VARIABLE_TEXT = 5000;

/** Every AI origin at once: what the picker's "Creations" tab lists. */
export const CREATION_SOURCES: readonly AssetSource[] = ["chat", "workflow", "bot"];

/** Backend refusal code → the copy key under `appChat.flow.variables.errors`. */
export const ERROR_KEYS: Record<string, string> = {
  flow_variable_name_invalid: "nameInvalid",
  flow_variable_kind_invalid: "itemsInvalid",
  flow_variable_items_invalid: "itemsInvalid",
  flow_variable_content_invalid: "contentInvalid",
  flow_variable_content_too_long: "contentTooLong",
  flow_variable_limit_exceeded: "limit",
  flow_variable_not_found: "notFound",
};
