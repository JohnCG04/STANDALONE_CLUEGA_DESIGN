"use client";

import { AlertTriangle, Loader2, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslate } from "@/hooks/useTranslate";
import type { VirtualCharacter, VirtualCharacterQuota } from "@/lib/virtualCharacters/types";

import { CHARACTER_MAX_IMAGES } from "../../../constants";
import {
  describeCharacterError,
  emptyCharacter,
  slotsLeft,
  toCreateInput,
  uploadImageCount,
  uploadReady,
} from "../../../helpers";
import { useCharacterMutations } from "../../../hooks/useCharacterMutations";
import type { DraftCharacter, UploadDraft } from "../../../types";
import { DraftCharacterRow } from "../../DraftCharacterRow";

export interface UploadTabProps {
  upload: UploadDraft;
  quota?: VirtualCharacterQuota;
  onChange: (update: (upload: UploadDraft) => UploadDraft) => void;
  onCreated: (characters: VirtualCharacter[]) => void;
}

/** One or more new characters, sent together into the workspace's library for BytePlus review. */
export const UploadTab = ({ upload, quota, onChange, onCreated }: UploadTabProps) => {
  const { t } = useTranslate();
  const { create } = useCharacterMutations();
  // Unknown quota never hides the upload; the server still refuses a create over it.
  const slots = quota ? slotsLeft(quota) : Number.POSITIVE_INFINITY;
  const needed = uploadImageCount(upload);
  const ready = uploadReady(upload, slots);
  const rows = upload.characters;
  const locked = create.isPending;

  const patchRow = (key: string, update: (row: DraftCharacter) => DraftCharacter) =>
    onChange((u) => ({
      ...u,
      characters: u.characters.map((c) => (c.key === key ? update(c) : c)),
    }));

  const submit = () =>
    create.mutate(toCreateInput(upload), {
      onSuccess: (created) => {
        onChange(() => ({ attested: false, characters: [emptyCharacter("first")] }));
        onCreated(created);
      },
    });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {rows.map((row, index) => (
          <DraftCharacterRow
            key={row.key}
            row={row}
            position={rows.length > 1 ? index + 1 : undefined}
            maxImages={CHARACTER_MAX_IMAGES}
            disabled={locked}
            onChange={(update) => patchRow(row.key, update)}
            onRemove={
              rows.length > 1
                ? () =>
                    onChange((u) => ({
                      ...u,
                      characters: u.characters.filter((c) => c.key !== row.key),
                    }))
                : undefined
            }
          />
        ))}

        <button
          type="button"
          onClick={() => onChange((u) => ({ ...u, characters: [...u.characters, emptyCharacter()] }))}
          disabled={locked}
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 text-[13px] font-medium text-neutral-600 transition-colors duration-200 hover:border-teal-400 hover:bg-teal-50/60 hover:text-teal-700 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-teal-500 dark:hover:bg-teal-950/30 dark:hover:text-teal-300"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("appChat.characters.drawer.addAnother")}
        </button>

        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t("appChat.characters.form.limits")}
        </p>
        <Checkbox
          checked={upload.attested}
          disabled={locked}
          className="items-start"
          boxClassName="mt-0.5"
          onCheckedChange={(attested) => onChange((u) => ({ ...u, attested }))}
          // The attestation must read in full, so it wraps instead of the label's ellipsis.
          label={
            <span className="block whitespace-normal text-[12px] leading-snug">
              {t("appChat.characters.form.attest")}
            </span>
          }
        />
        {needed > slots ? (
          <p role="alert" className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {t("appChat.characters.node.overQuota")
              .replace("{needed}", String(needed))
              .replace("{left}", String(slots))}
          </p>
        ) : null}
        {create.error ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-[12px] font-medium text-red-700 animate-in fade-in-0 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {describeCharacterError(create.error, t)}
          </p>
        ) : null}
      </div>

      <footer className="flex justify-end border-t border-neutral-200/80 bg-white/80 px-5 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
        <Button
          variant="primary"
          onClick={() => (ready ? submit() : undefined)}
          disabled={locked || !ready}
          className="rounded-xl"
        >
          {locked ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-4" aria-hidden="true" />
          )}
          {rows.length === 1
            ? t("appChat.characters.drawer.uploadOne")
            : t("appChat.characters.drawer.uploadMany").replace("{n}", String(rows.length))}
        </Button>
      </footer>
    </>
  );
};
