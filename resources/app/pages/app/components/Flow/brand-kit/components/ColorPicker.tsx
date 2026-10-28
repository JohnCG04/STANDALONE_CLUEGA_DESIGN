"use client";

import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { clamp } from "@/lib/utils";

import { PICKER_AREA_CLASS, PICKER_HANDLE_CLASS, PICKER_HUE_CLASS } from "../constants";
import { hsvToHex, type Hsv } from "../helpers";

/** Arrow keys move by this much; Shift multiplies it by ten. */
const STEP = { sv: 0.01, hue: 1 };

/**
 * The saturation/brightness square and the hue strip.
 *
 * HSV in, HSV out: a hex cannot carry a hue through black (see hsvToHex), and
 * the strip must keep pointing somewhere while the square is dragged into its
 * dark corner.
 *
 * Both are `role="slider"` and keyboard-driven. The square reports two axes
 * through one role, which ARIA has no better answer for; `aria-valuetext`
 * speaks the hex, and the typed field remains the precise way in.
 *
 * Pointer capture rather than document listeners: it follows the pointer
 * outside the element and releases itself, so no listener outlives an unmount.
 */
export const ColorPicker = ({
  hsv,
  onChange,
}: {
  hsv: Hsv;
  onChange: (next: Hsv) => void;
}) => {
  const { t } = useTranslate();
  const hex = hsvToHex(hsv);

  const trackArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onChange({
      ...hsv,
      s: clamp((event.clientX - box.left) / box.width),
      v: 1 - clamp((event.clientY - box.top) / box.height),
    });
  };

  const trackHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onChange({ ...hsv, h: clamp((event.clientX - box.left) / box.width) * 360 });
  };

  const drag =
    (track: (event: ReactPointerEvent<HTMLDivElement>) => void) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        track(event);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) track(event);
      },
    });

  const onAreaKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP.sv * (event.shiftKey ? 10 : 1);
    const moved =
      event.key === "ArrowLeft"
        ? { s: clamp(hsv.s - step) }
        : event.key === "ArrowRight"
          ? { s: clamp(hsv.s + step) }
          : event.key === "ArrowUp"
            ? { v: clamp(hsv.v + step) }
            : event.key === "ArrowDown"
              ? { v: clamp(hsv.v - step) }
              : null;
    if (!moved) return;
    event.preventDefault();
    onChange({ ...hsv, ...moved });
  };

  const onHueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP.hue * (event.shiftKey ? 10 : 1);
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? hsv.h - step
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? hsv.h + step
          : null;
    if (next === null) return;
    event.preventDefault();
    onChange({ ...hsv, h: (next + 360) % 360 });
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("appChat.brandKit.colors.areaLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={hex}
        onKeyDown={onAreaKey}
        {...drag(trackArea)}
        className={PICKER_AREA_CLASS}
        style={{
          backgroundImage:
            "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))",
          backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
        }}
      >
        <span
          aria-hidden="true"
          className={PICKER_HANDLE_CLASS}
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: hex,
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("appChat.brandKit.colors.hueLabel")}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onKeyDown={onHueKey}
          {...drag(trackHue)}
          className={PICKER_HUE_CLASS}
        >
          <span
            aria-hidden="true"
            className={PICKER_HANDLE_CLASS}
            style={{
              left: `${(hsv.h / 360) * 100}%`,
              top: "50%",
              backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
            }}
          />
        </div>
        <span
          aria-hidden="true"
          style={{ backgroundColor: hex }}
          className="size-9 shrink-0 rounded-lg border border-black/10 dark:border-white/15"
        />
      </div>
    </div>
  );
};
