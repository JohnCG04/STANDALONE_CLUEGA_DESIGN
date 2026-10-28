"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { SocialPostNodeBodyProps } from "@dogclaw-ad/workflow";
import type { StoreApi } from "zustand";

import type { SocialPostState } from "@/resources/app/pages/app/components/SocialPost/store";

import { draftKey, draftOf, readSaved, restoredDraft, withDraft } from "../helpers";

/** Keeps the form and `data.post` in step: edits save, and an undo of the node shows. */
export function useSavedDraftSync({
  store,
  nodeId,
  data,
  onDataChange,
  pendingKeys,
}: {
  store: StoreApi<SocialPostState>;
  nodeId: string;
  data: SocialPostNodeBodyProps["data"];
  onDataChange: SocialPostNodeBodyProps["onDataChange"];
  /** Saved accounts not ticked yet (still loading, or waiting on a reconnect). */
  pendingKeys: RefObject<string[]>;
}) {
  // Starts at what is saved, so opening a workflow writes nothing and leaves it unchanged.
  const lastKey = useRef(draftKey(readSaved(data)));
  const savedMedia = useRef(readSaved(data).media);

  useEffect(() => {
    const write = (state: SocialPostState) => {
      const draft = draftOf(state, pendingKeys.current, savedMedia.current);
      const key = draftKey(draft);
      if (key === lastKey.current) return;
      lastKey.current = key;
      savedMedia.current = draft.media;
      onDataChange((prev) => withDraft(prev, nodeId, draft));
    };
    write(store.getState());
    return store.subscribe(write);
  }, [store, nodeId, onDataChange, pendingKeys]);

  // A change this hook didn't write came from elsewhere (undo, redo): show it.
  useEffect(() => {
    const saved = readSaved(data);
    const key = draftKey(saved);
    if (key === lastKey.current) return;
    lastKey.current = key;
    savedMedia.current = saved.media;
    pendingKeys.current = saved.accountKeys ?? [];
    store.setState(restoredDraft(store.getState(), saved, new Date()));
  }, [data, store, pendingKeys]);
}
