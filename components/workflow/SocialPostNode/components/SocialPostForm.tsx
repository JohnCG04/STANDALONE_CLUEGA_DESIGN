"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { SocialPostNodeBodyProps, SocialPostNodeInput } from "@dogclaw-ad/workflow";

import {
  useSocialPost,
  useSocialPostStoreApi,
} from "@/resources/app/pages/app/components/SocialPost/storeContext";

import { contextOf, ownPosts, readSaved, reconcileSelection, seedState } from "../helpers";
import { usePostStatuses } from "../hooks/usePostStatuses";
import { useSavedDraftSync } from "../hooks/useSavedDraftSync";
import { MediaNotices } from "./MediaNotices";
import { NodeComposeStep } from "./NodeComposeStep";
import { NodePlatformStep } from "./NodePlatformStep";
import { PostStatusList } from "./PostStatusList";

export interface SocialPostFormProps {
  nodeId: string;
  inputs: readonly SocialPostNodeInput[];
  data: SocialPostNodeBodyProps["data"];
  onDataChange: SocialPostNodeBodyProps["onDataChange"];
  readOnly: boolean;
  /** Saved accounts not ticked yet; shared by the draft sync and the restore. */
  pendingKeys: RefObject<string[]>;
}

/** The node's two steps, as in the drawer, over its wired media and the posts it sent. */
export function SocialPostForm({
  nodeId,
  inputs,
  data,
  onDataChange,
  readOnly,
  pendingKeys,
}: SocialPostFormProps) {
  const store = useSocialPostStoreApi();
  const step = useSocialPost((s) => s.step);
  // Saved accounts are restored instead of the drawer's "first account per platform".
  const [restoring, setRestoring] = useState(() => !!readSaved(data).accountKeys?.length);
  useSavedDraftSync({ store, nodeId, data, onDataChange, pendingKeys });

  const context = useMemo(() => contextOf(inputs), [inputs]);
  useEffect(() => {
    const picked = store.getState().selectedAssets.map((asset) => asset.url);
    store.getState().setMedia(context, reconcileSelection(context, picked));
  }, [context, store]);

  const posts = useMemo(() => ownPosts(readSaved(data), nodeId), [data, nodeId]);
  const records = usePostStatuses(posts);

  // Back to a blank step 1 on the same media; the posts already sent stay listed.
  const discard = useCallback(() => {
    pendingKeys.current = [];
    setRestoring(false);
    store.setState(seedState(readSaved(undefined), store.getState().context, new Date()));
  }, [store, pendingKeys]);

  return (
    <div className="flex flex-col gap-4 py-1 font-sans text-foreground">
      <MediaNotices inputs={inputs} />
      {step === "compose" ? (
        <NodeComposeStep
          nodeId={nodeId}
          onDataChange={onDataChange}
          readOnly={readOnly}
          pendingKeys={pendingKeys}
          preselect={!restoring}
          posted={posts.length > 0}
          hasMedia={context !== null}
          onDiscard={discard}
        />
      ) : (
        <NodePlatformStep readOnly={readOnly} />
      )}
      <PostStatusList records={records} />
    </div>
  );
}
