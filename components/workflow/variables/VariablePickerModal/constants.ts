import type { FlowVariableKind } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import type { PickerSource } from "../types";

export const KINDS: readonly FlowVariableKind[] = ["image", "video", "audio", "text"];

export const SOURCES: readonly PickerSource[] = ["upload", "creation"];

/** Thumbnails shown beside the count before the rest collapse into it. */
export const PREVIEW_COUNT = 4;

export const PAGE_SIZE = 40;
