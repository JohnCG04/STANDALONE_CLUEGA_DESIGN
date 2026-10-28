"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { WorkflowCharacter, WorkflowCharactersConfig } from "@dogclaw-ad/workflow";

import { useVirtualCharacters } from "@/lib/virtualCharacters/queries";
import type { VirtualCharacter } from "@/lib/virtualCharacters/types";

/** The Character node's form; split out, since most workflows never add one. */
const CharacterNodeBody = dynamic(
  () => import("../../CharacterNode").then((mod) => mod.CharacterNodeBody),
  { ssr: false },
);

function toWorkflowCharacter(c: VirtualCharacter): WorkflowCharacter[] {
  // A deleting character is already gone for the canvas.
  if (c.status === "deleting") return [];
  return [
    {
      id: c.id,
      name: c.name,
      coverUrl: c.coverUrl || undefined,
      status: c.status,
      failureReason: c.failureReason || undefined,
    },
  ];
}

/** The workspace's characters for the Character node and the Assets panel's Characters tab. */
export function useWorkflowCharacters(): WorkflowCharactersConfig {
  const { data, isPending } = useVirtualCharacters();
  return useMemo(
    () => ({
      characters: (data?.characters ?? []).flatMap(toWorkflowCharacter),
      loading: isPending,
      Body: CharacterNodeBody,
    }),
    [data, isPending],
  );
}
