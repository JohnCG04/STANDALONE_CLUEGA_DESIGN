import { translateStatic } from "@/hooks/useTranslate";

// Read at throw time so the node's error follows the UI language.
export const STORYBOARD_MESSAGES = {
  noScene: () => translateStatic("appChat.flow.storyboard.noScene"),
} as const;
