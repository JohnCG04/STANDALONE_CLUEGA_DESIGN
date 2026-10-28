"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SearchX } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { LearnButton } from "@/components/learn";
import { useTranslate } from "@/hooks/useTranslate";
import {
  flowBrandKitDetailPath,
  flowBrandKitNewPath,
} from "@/lib/flow/flowBrandKitRoute";
import { useToastStore } from "@/lib/stores/useToastStore";

import { FlowEmptyState } from "../../components/FlowEmptyState";
import { FlowPageShell } from "../../components/FlowPageShell";
import { BrandKitCard } from "../components/BrandKitCard";
import { BrandKitGridSkeleton } from "../components/BrandKitGridSkeleton";
import { ImportGuidelineCard } from "../components/ImportGuidelineCard";
import { DeleteBrandKitDialog } from "../components/DeleteBrandKitDialog";
import { BRAND_KIT_GRID_CLASS } from "../constants";
import { brandCard, describeTemplatesError, templateCard } from "../helpers";
import { useActiveBrand } from "../hooks/useActiveBrand";
import { useBrandKitList } from "../hooks/useBrandKitList";
import { useBrandKitTemplates } from "../hooks/useBrandKitTemplates";
import { useDeleteBrandKit } from "../hooks/useDeleteBrandKit";

/**
 * The Brand Kit landing: this tenant's own kits, then the samples to start from.
 *
 * Both sections are drawn from the kit data alone — see `templateCard` for why
 * samples never carry a cover photo or a logo.
 */
export const BrandKitListPage = () => {
  const { t } = useTranslate();
  const router = useRouter();
  const { brands, isLoading, isError, refetch } = useBrandKitList();
  const samples = useBrandKitTemplates();
  // Fed the list rather than reading a store: the badge follows the service's
  // `is_default`, which is the same answer in every browser the user opens.
  const { activeId, activate } = useActiveBrand(brands);
  const remove = useDeleteBrandKit();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const brandCards = useMemo(() => brands.map(brandCard), [brands]);
  const templateCards = useMemo(
    () => samples.templates.map((template) => templateCard(template, t)),
    [samples.templates, t],
  );

  return (
    <FlowPageShell>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight text-neutral-900 dark:text-neutral-50">
            {t("appChat.brandKit.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {t("appChat.brandKit.subtitle")}
          </p>
        </div>
        <LearnButton guideId="flow" className="rounded-full" />
      </header>

      {isError ? (
        <FlowEmptyState
          icon={SearchX}
          title={t("appChat.brandKit.loadFailed")}
          description={t("appChat.brandKit.error.generic")}
          actionLabel={t("appChat.brandKit.retry")}
          onAction={refetch}
        />
      ) : isLoading ? (
        <BrandKitGridSkeleton />
      ) : (
        <>
          <section className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold text-neutral-900 dark:text-neutral-50">
                  {t("appChat.brandKit.yourKits")}
                </h2>
                {/* Owning a brand is not using one, and the difference is worth
                    naming: until somebody chooses, images carry none — and the
                    action that fixes it is on every card. */}
                <p className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                  {activeId
                    ? t("appChat.brandKit.activeHint")
                    : t("appChat.brandKit.noActive")}
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="h-11 rounded-full px-5 text-[14px] font-semibold"
                title={t("appChat.brandKit.createBlankHint")}
                onClick={() => router.push(flowBrandKitNewPath())}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("appChat.brandKit.createBlank")}
              </Button>
            </div>

            {/*
              The third way to start a kit, beside blank and sample. A brand
              created from a guideline lands saved, so this goes straight to
              its detail page rather than to `/new`.

              The toast is not decoration. Only the FIRST logo is ever
              composited, onto every render — so when the file held nothing
              that looked like a mark and one was taken anyway, saying so
              here is the only moment the user is looking at the right
              screen to check it.
            */}
            <div className="mt-4">
              <ImportGuidelineCard
                onImported={({ brand, extraction }) => {
                  const notice =
                    extraction.logoSource === "fallback"
                      ? t("appChat.brandKit.importDoc.guessedLogo")
                      : extraction.logoSource === "none"
                        ? t("appChat.brandKit.importDoc.noLogo")
                        : null;
                  if (notice) useToastStore.getState().push(notice);
                  if (extraction.droppedUngrounded.length) {
                    useToastStore
                      .getState()
                      .push(
                        t("appChat.brandKit.importDoc.dropped").replace(
                          "{count}",
                          String(extraction.droppedUngrounded.length),
                        ),
                      );
                  }
                  router.push(flowBrandKitDetailPath(brand.brand_id));
                }}
              />
            </div>

            {brandCards.length > 0 ? (
              <div className={BRAND_KIT_GRID_CLASS}>
                {brandCards.map((card) => (
                  <BrandKitCard
                    key={card.id}
                    card={card}
                    isActive={card.id === activeId}
                    onOpen={() => router.push(flowBrandKitDetailPath(card.id))}
                    onSetActive={() => {
                      // Toasted on the ANSWER, not on the click: this writes to
                      // the service now, and a green "{name} is now the default"
                      // over a failed PUT is the one message that must not lie.
                      void activate(card.id).then((ok) => {
                        useToastStore
                          .getState()
                          .push(
                            ok
                              ? t("appChat.brandKit.toast.activated").replace(
                                  "{name}",
                                  card.name,
                                )
                              : t("appChat.brandKit.toast.activateFailed"),
                            ok ? "info" : "error",
                          );
                      });
                    }}
                    onDelete={() => setDeleting({ id: card.id, name: card.name })}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                {t("appChat.brandKit.yourKitsEmpty")}
              </p>
            )}
          </section>

          {/* The heading renders in all three states on purpose. A section that
              disappears on a failed fetch is indistinguishable from a
              deployment that ships no templates, and the user has no way to
              tell which one they are looking at. */}
          <section className="mt-10">
            <h2 className="text-[16px] font-bold text-neutral-900 dark:text-neutral-50">
              {t("appChat.brandKit.samples")}
            </h2>
            <p className="mt-0.5 max-w-2xl text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
              {t("appChat.brandKit.samplesHint")}
            </p>

            {samples.isLoading ? (
              <BrandKitGridSkeleton />
            ) : samples.isError ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <p className="text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
                  {describeTemplatesError(samples.error, t)}
                </p>
                <Button variant="outline" size="sm" className="rounded-full" onClick={samples.refetch}>
                  {t("appChat.brandKit.retry")}
                </Button>
              </div>
            ) : templateCards.length === 0 ? (
              <p className="mt-4 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                {t("appChat.brandKit.samplesEmpty")}
              </p>
            ) : (
              <div className={BRAND_KIT_GRID_CLASS}>
                {templateCards.map((card) => (
                  <BrandKitCard
                    key={card.id}
                    card={card}
                    isActive={false}
                    // A sample is not a brand until it is imported, so there is
                    // nothing to set active and nothing to delete.
                    onOpen={() => router.push(flowBrandKitNewPath(card.id))}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <DeleteBrandKitDialog
        name={deleting?.name ?? ""}
        open={deleting !== null}
        pending={remove.pending}
        failedMessage={remove.failedMessage}
        onCancel={() => {
          remove.clearFailure();
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          void remove.remove(deleting.id).then((done) => {
            // A 409 keeps the dialog open with the service's own sentence: the
            // brand still has products, and closing would hide why.
            if (done) setDeleting(null);
          });
        }}
      />
    </FlowPageShell>
  );
};
