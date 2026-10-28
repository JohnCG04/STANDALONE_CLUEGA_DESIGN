"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useTranslate } from "@/hooks/useTranslate";
import type { VirtualCharacterStatus } from "@/lib/virtualCharacters/types";

const VARIANT = {
  processing: "secondary",
  active: "success",
  failed: "destructive",
  deleting: "outline",
} as const;

/** BytePlus review state as a pill; `processing` spins so a waiting card reads as live. */
export const CharacterStatusBadge = ({ status }: { status: VirtualCharacterStatus }) => {
  const { t } = useTranslate();
  return (
    <Badge variant={VARIANT[status]} className="gap-1 rounded-full px-2 py-0.5 text-[11px]">
      {status === "processing" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : null}
      {t(`appChat.characters.status.${status}`)}
    </Badge>
  );
};
