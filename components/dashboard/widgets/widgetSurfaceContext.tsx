"use client";

import { createContext, useContext } from "react";

import { PULSE_CHAT_PALETTE, paletteFor, type WidgetPalette } from "./tokens";

/**
 * Where a board is drawn. Only the Pulse chat sets it, from the FE, never from the payload.
 * Absent ("panel") keeps every widget exactly as My dashboards and the galleries draw it.
 */
type WidgetSurface = "panel" | "chat";

export const WidgetSurfaceContext = createContext<WidgetSurface>("panel");

/** A hugging list's scroll ceiling on chat: the 520px a report table already scrolls past. */
export const CHAT_LIST_MAX_PX = 520;

/** True on a chat board: text wraps instead of clipping, tables and notes hug their content. */
export function useChatSurface(): boolean {
  return useContext(WidgetSurfaceContext) === "chat";
}

/** Whether a slot draws in the Pulse series: on a chat board, with no presentation of its own. */
export function usePulseSeries(presentation?: string): boolean {
  return useChatSurface() && !presentation;
}

/** `paletteFor(presentation)`, except where `usePulseSeries` holds: the Pulse series palette. */
export function useWidgetPalette(presentation?: string): WidgetPalette {
  return usePulseSeries(presentation) ? PULSE_CHAT_PALETTE : paletteFor(presentation);
}
