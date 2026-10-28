import type {
  FlowVariableItem,
  FlowVariableKind,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import type { PickableAsset } from "@/resources/app/pages/app/components/PromptComposer/components/modals/AssetLibraryModal/AssetGrid";

export type MediaVariableKind = Exclude<FlowVariableKind, "text">;
export type PickerSource = "upload" | "creation";

/** A tile picked in the picker, with the snapshot the backend stores for it. */
export interface PickedTile extends PickableAsset {
  item: FlowVariableItem;
}
