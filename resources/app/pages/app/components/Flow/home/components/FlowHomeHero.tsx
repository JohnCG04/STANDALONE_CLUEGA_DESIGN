"use client";

import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The workflow-canvas still the hero band is built on — one capture per theme,
 * since the canvas itself is a light or a dark surface and neither reads as the
 * other tinted.
 */
const HERO_BACKDROP_SRC = {
  light: "/Image/bg-flow-light.png",
  dark: "/Image/bg-flow-dark.png",
} as const;

/**
 * Both stills, the theme picking one with `dark:`. Rendered as a pair rather
 * than resolved in JS because the theme class is on <html> from the very first
 * server render: a hook would start on `light` and swap after hydration, which
 * dark-mode users would see as a white flash across the top of the page.
 */
const HeroStill = ({ priority = false }: { priority?: boolean }) => (
  <>
    <Image
      src={HERO_BACKDROP_SRC.light}
      alt=""
      fill
      priority={priority}
      sizes="100vw"
      className="object-cover object-top dark:hidden"
    />
    <Image
      src={HERO_BACKDROP_SRC.dark}
      alt=""
      fill
      priority={priority}
      sizes="100vw"
      className="hidden object-cover object-top dark:block"
    />
  </>
);

/**
 * The band at the top of Home. It takes the page actions as `actions` rather
 * than leaving them to the caller so the still can start at the very top of the
 * scroll area — the row sits ON the art instead of on a strip of page above it.
 * The negative margins cancel the shell's own padding for that, and the header
 * puts it back inside the band; the spacer below the row is what gives the art
 * its height, so nothing here hard-codes how tall the row happens to be.
 *
 * Inside the band, bottom to top:
 *
 * 1. the canvas still, full-bleed across the shell's side padding,
 * 2. a sheet in the page's own colour that dims it down to a texture,
 * 3. the same still again, masked to one circle that sweeps left ↔ right — the
 *    art reads clearly wherever the circle currently is,
 * 4. a fade into the page, last so it takes the circle with it: without it the
 *    revealed art would end on a hard line at the bottom of the band.
 *
 * Then `children` — the agent launcher, unchanged — sits below all four, on the
 * page's own surface where its text has nothing behind it.
 */
export const FlowHomeHero = ({
  actions,
  children,
}: {
  /** The page-action row, rendered over the art. */
  actions: ReactNode;
  children: ReactNode;
}) => (
  <section className="relative -mx-6 -mt-6 sm:-mx-8 sm:-mt-8">
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <HeroStill priority />

        <div className="absolute inset-0 bg-white/72 dark:bg-neutral-950/72" />

        <div className="flow-home-spotlight absolute inset-0">
          <HeroStill />
        </div>

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-white dark:to-neutral-950" />
      </div>

      <header className="relative flex min-h-10 flex-wrap items-center justify-end gap-2 px-6 pt-6 sm:px-8 sm:pt-8">
        {actions}
      </header>

      <div className="h-[200px] sm:h-[300px]" />
    </div>

    <div className="relative px-6 sm:px-8">{children}</div>
  </section>
);
