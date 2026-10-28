"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

import { useSocialPostStore, type SocialPostState } from "./store";

// Defaults to the shared dock store, so the Chat and Pulse panels need no provider.
const SocialPostStoreContext =
  createContext<StoreApi<SocialPostState>>(useSocialPostStore);

/** Scopes the compose step to `store` (a workflow node's own flow). */
export function SocialPostStoreProvider({
  store,
  children,
}: {
  store: StoreApi<SocialPostState>;
  children: ReactNode;
}) {
  return (
    <SocialPostStoreContext.Provider value={store}>{children}</SocialPostStoreContext.Provider>
  );
}

/** The flow's store in scope; read `getState()` from it inside handlers. */
export function useSocialPostStoreApi(): StoreApi<SocialPostState> {
  return useContext(SocialPostStoreContext);
}

/** A slice of the flow in scope, like `useSocialPostStore(selector)`. */
export function useSocialPost<T>(selector: (state: SocialPostState) => T): T {
  return useStore(useSocialPostStoreApi(), selector);
}
