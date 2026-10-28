"use client";

import { useCallback } from "react";

import { useTranslate } from "@/hooks/useTranslate";

/** Add or drop one member, without disturbing the order of the rest. */
export function withMember(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

/**
 * A chip's label: the i18n entry for a preset id, or the value itself for
 * something the user typed.
 *
 * `t()` renders the raw dotted key on a miss, so a typed value has to be
 * detected rather than looked up — otherwise "bloom" would show as
 * "appChat.brandKit.options.values.bloom".
 */
export function useChipLabel(group: string) {
  const { t } = useTranslate();
  return useCallback(
    (value: string) => {
      const key = `appChat.brandKit.options.${group}.${value}`;
      const label = t(key);
      return label === key ? value : label;
    },
    [group, t],
  );
}
