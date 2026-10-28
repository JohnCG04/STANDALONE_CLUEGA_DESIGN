"use client";

import { useRef, useState } from "react";
import type { SocialPostNodeBodyProps } from "@dogclaw-ad/workflow";

import { createSocialPostStore } from "@/resources/app/pages/app/components/SocialPost/store";
import { SocialPostStoreProvider } from "@/resources/app/pages/app/components/SocialPost/storeContext";

import { SocialPostForm } from "./components/SocialPostForm";
import { contextOf, readSaved, seedState } from "./helpers";

/** The Post to social node's form: the chat's composer, scoped to this node and saved into it. */
export function SocialPostNodeBody({
  nodeId,
  inputs,
  data,
  onDataChange,
  readOnly,
}: SocialPostNodeBodyProps) {
  // Seeded once; later inputs and undos reach it through the form's own sync.
  const [store] = useState(() =>
    createSocialPostStore(seedState(readSaved(data), contextOf(inputs), new Date())),
  );
  const pendingKeys = useRef(readSaved(data).accountKeys ?? []);

  return (
    <SocialPostStoreProvider store={store}>
      <SocialPostForm
        nodeId={nodeId}
        inputs={inputs}
        data={data}
        onDataChange={onDataChange}
        readOnly={readOnly}
        pendingKeys={pendingKeys}
      />
    </SocialPostStoreProvider>
  );
}
