"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslate } from "@/hooks/useTranslate";
import type { VirtualCharacter, VirtualCharacterQuota } from "@/lib/virtualCharacters/types";

import { CHARACTER_MAX_IMAGES } from "../../../constants";
import {
  describeCharacterError,
  draftFromCharacter,
  editReady,
  freedSlots,
  newImageCount,
  slotsLeft,
  toUpdateInput,
} from "../../../helpers";
import { useCharacterMutations } from "../../../hooks/useCharacterMutations";
import { CharacterStatusBadge } from "../../CharacterStatusBadge";
import { DeleteCharacterDialog } from "../../DeleteCharacterDialog";
import { DraftCharacterRow } from "../../DraftCharacterRow";

export interface EditCharacterProps {
  character: VirtualCharacter;
  quota?: VirtualCharacterQuota;
  onBack: () => void;
  onDeleted: (id: string) => void;
}

/** One character's edit: rename, keep or drop images, add new ones; Save sends the wanted state. */
export const EditCharacter = ({ character, quota, onBack, onDeleted }: EditCharacterProps) => {
  const { t } = useTranslate();
  const { update, retry, remove } = useCharacterMutations();
  // The edit is local: Back throws it away, Save replaces the character with it.
  const [row, setRow] = useState(() => draftFromCharacter(character));
  const [attested, setAttested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const slots = quota ? slotsLeft(quota, freedSlots(character, row)) : Number.POSITIVE_INFINITY;
  const added = newImageCount(row);
  const ready = editReady(row, attested, slots);
  const pending = update.isPending || retry.isPending;
  const error = update.error ?? retry.error ?? remove.error;

  return (
    <>
      <div className="flex items-center gap-2 px-5 pt-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("appChat.characters.drawer.back")}
          className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t("appChat.characters.drawer.editTitle")}
        </span>
        <CharacterStatusBadge status={character.status} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
        {character.status === "failed" ? (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/70 p-3 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="text-[12px] font-medium text-red-700 dark:text-red-300">
              {character.failureReason || t("appChat.characters.drawer.rejectedHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 self-start px-2 text-[11px]"
              disabled={pending}
              onClick={() => retry.mutate(character.id)}
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              {t("appChat.characters.retry")}
            </Button>
          </div>
        ) : null}

        <DraftCharacterRow
          row={row}
          maxImages={CHARACTER_MAX_IMAGES}
          disabled={pending}
          onChange={(change) => setRow(change)}
        />
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t("appChat.characters.form.limits")}
        </p>
        {/* An edit that only renames or removes uploads nothing, so there is nothing to attest. */}
        {added > 0 ? (
          <Checkbox
            checked={attested}
            disabled={pending}
            className="items-start"
            boxClassName="mt-0.5"
            onCheckedChange={setAttested}
            label={
              <span className="block whitespace-normal text-[12px] leading-snug">
                {t("appChat.characters.form.attest")}
              </span>
            }
          />
        ) : null}
        {added > slots ? (
          <p role="alert" className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {t("appChat.characters.node.overQuota")
              .replace("{needed}", String(added))
              .replace("{left}", String(slots))}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-[12px] font-medium text-red-700 animate-in fade-in-0 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {describeCharacterError(error, t)}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 border-t border-neutral-200/80 bg-white/80 px-5 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
        <Button
          variant="ghost"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t("appChat.characters.delete")}
        </Button>
        <span className="flex-1" />
        <Button variant="outline" onClick={onBack} disabled={pending} className="rounded-xl">
          {t("appChat.characters.form.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={pending || !ready}
          className="rounded-xl"
          onClick={() =>
            ready
              ? update.mutate({ id: character.id, input: toUpdateInput(row) }, { onSuccess: onBack })
              : undefined
          }
        >
          {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t("appChat.characters.node.save")}
        </Button>
      </footer>

      <DeleteCharacterDialog
        name={character.name}
        open={confirming}
        pending={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          remove.mutate(character.id, {
            onSuccess: () => {
              setConfirming(false);
              onDeleted(character.id);
            },
          })
        }
      />
    </>
  );
};
