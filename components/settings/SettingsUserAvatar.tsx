"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";

import { avatarColor, avatarInitial } from "./avatarIdentity";

/**
 * The signed-in user's avatar: their initial on their own colour.
 *
 * It was one hard-coded pixel-art face, so every account in every workspace
 * looked identical. There is no uploaded picture to show yet, so this is the
 * placeholder the Team Directory already draws for the same person.
 *
 * Size and letter size come from `className`; the caller's frame decides both.
 * Until the identity is known it is a plain grey disc rather than a "?", which
 * would flash for one frame on every open.
 */
export function SettingsUserAvatar({ className }: { className?: string }) {
  const me = useCurrentUser();
  const known = Boolean(me.displayName.trim() || me.email.trim());

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex select-none items-center justify-center bg-neutral-300 font-semibold text-white dark:bg-neutral-700",
        className,
      )}
      style={known ? { background: avatarColor(me.email || me.displayName) } : undefined}
    >
      {known ? avatarInitial(me.displayName, me.email) : null}
    </span>
  );
}
