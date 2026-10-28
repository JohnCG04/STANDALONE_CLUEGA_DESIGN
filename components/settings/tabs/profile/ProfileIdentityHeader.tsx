"use client";

import { useState } from "react";
import { Building2, Check, Copy, ExternalLink } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SettingsUserAvatar } from "../../SettingsUserAvatar";

/**
 * Who this account is: picture, name, email, and which workspace it belongs to.
 *
 * `displayName` is a prop rather than read from `useCurrentUser` here because
 * the tab shows the name AS TYPED while an unsaved edit is in the input — the
 * cached profile would lag one save behind and read as "my change was not
 * applied".
 */
export function ProfileIdentityHeader({ displayName }: { displayName: string }) {
  const me = useCurrentUser();
  const [copiedTenantId, setCopiedTenantId] = useState(false);

  // The tick is the whole confirmation — a toast for copying an id would be
  // louder than the action. It clears itself so a second copy still reads as one.
  async function copyTenantId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // Clipboard is blocked outside a secure context and in some embedded
      // views. The id is already in the title attribute, so the user can still
      // read and select it; saying nothing beats an error for a convenience.
      return;
    }
    setCopiedTenantId(true);
    window.setTimeout(() => setCopiedTenantId(false), 2000);
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <SettingsUserAvatar className="h-full w-full text-[22px]" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {displayName}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
            {me.email}
          </div>
          {/* Which workspace this account is in. Two accounts on the same email
              across two workspaces look identical without it, and the id is
              what support asks for first — so it is here, quiet, and
              copyable, rather than left for someone to dig out of a URL. */}
          {me.tenant ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Building2
                className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500"
                strokeWidth={1.75}
              />
              <span className="text-[12px] text-neutral-600 dark:text-neutral-300">
                {me.tenant.name}
              </span>
              <button
                type="button"
                onClick={() => void copyTenantId(me.tenant!.id)}
                title={me.tenant.id}
                className="flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              >
                {/* First segment only. The full id is in the tooltip and on the
                    clipboard; 36 characters inline would outrun the name it
                    belongs to. */}
                {me.tenant.id.split("-")[0]}
                {copiedTenantId ? (
                  <Check className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <Copy className="h-3 w-3" strokeWidth={1.75} />
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-500 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:bg-neutral-950 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
