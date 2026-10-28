import { queryOptions, useQuery } from "@tanstack/react-query";

import { listVirtualCharacters } from "./api";
import type { VirtualCharacterLibrary } from "./types";

/** One key for the Character node, its drawer and the Assets panel's Characters tab. */
export const VIRTUAL_CHARACTERS_QUERY_KEY = ["virtual-characters"] as const;

/** Polls OUR backend while BytePlus reviews; the backend alone talks to BytePlus. */
const VIRTUAL_CHARACTERS_POLL_MS = 5_000;

function hasPendingReview(library: VirtualCharacterLibrary | undefined): boolean {
  return Boolean(
    library?.characters.some(
      (c) => c.status === "processing" || c.images.some((i) => i.status === "processing"),
    ),
  );
}

const virtualCharactersQueryOptions = queryOptions({
  queryKey: VIRTUAL_CHARACTERS_QUERY_KEY,
  queryFn: ({ signal }) => listVirtualCharacters(signal),
  // The shell's staleTime is Infinity, so a review in progress has to ask for its own refresh.
  refetchInterval: (query) =>
    hasPendingReview(query.state.data) ? VIRTUAL_CHARACTERS_POLL_MS : false,
  refetchOnWindowFocus: "always",
});

export function useVirtualCharacters() {
  return useQuery(virtualCharactersQueryOptions);
}
