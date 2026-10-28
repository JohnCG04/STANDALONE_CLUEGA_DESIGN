'use client';

import { useEffect, useState } from 'react';

import {
  getPreset,
  type FlowPreset,
} from '@/resources/app/pages/app/components/Flow/services/flow-presets.service';

/**
 * The catalog row (`?preset=` card or `?tool=`) the Flow admin sent us to edit; operators only.
 * A failed read leaves `preset` null: no edit mode, but the canvas still opens.
 */
export function useWorkflowPresetCard(
  presetId: string | undefined,
  enabled: boolean,
): {
  preset: FlowPreset | null;
  /** Adopt the row a save returned, so the next save sends its version. */
  replace: (next: FlowPreset) => void;
} {
  const [preset, setPreset] = useState<FlowPreset | null>(null);

  useEffect(() => {
    if (!presetId || !enabled) {
      setPreset(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    getPreset(presetId, controller.signal)
      .then((detail) => {
        if (!cancelled) setPreset(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[flow-admin] preset card read failed', err);
        setPreset(null);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [presetId, enabled]);

  return { preset, replace: setPreset };
}
