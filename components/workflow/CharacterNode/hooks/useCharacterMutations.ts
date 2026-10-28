"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createVirtualCharacters,
  deleteVirtualCharacter,
  retryVirtualCharacter,
  updateVirtualCharacter,
} from "@/lib/virtualCharacters/api";
import { VIRTUAL_CHARACTERS_QUERY_KEY } from "@/lib/virtualCharacters/queries";
import type {
  UpdateCharacterInput,
  VirtualCharacter,
  VirtualCharacterLibrary,
} from "@/lib/virtualCharacters/types";

/** Every write refetches the one query the node, its drawer and the Assets tab read. */
export function useCharacterMutations() {
  const queryClient = useQueryClient();
  const onSettled = () =>
    queryClient.invalidateQueries({ queryKey: VIRTUAL_CHARACTERS_QUERY_KEY });

  // New characters land in the cache first, so a node casting them never draws them as missing.
  const onCreated = (created: VirtualCharacter[]) =>
    queryClient.setQueryData<VirtualCharacterLibrary>(VIRTUAL_CHARACTERS_QUERY_KEY, (old) =>
      old ? { ...old, characters: [...created, ...old.characters] } : old,
    );
  const create = useMutation({
    mutationFn: createVirtualCharacters,
    onSuccess: onCreated,
    onSettled,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCharacterInput }) =>
      updateVirtualCharacter(id, input),
    onSettled,
  });
  const retry = useMutation({ mutationFn: retryVirtualCharacter, onSettled });
  const remove = useMutation({ mutationFn: deleteVirtualCharacter, onSettled });
  return { create, update, retry, remove };
}
