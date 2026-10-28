"use client";

import type { CompanyMember } from "@/lib/cdp/directoryClient";
import { cn } from "@/lib/utils";

import { avatarHue, memberInitials, shortUserId } from "../helpers";

// The ledger's "User" column.
//
// The cost book stores the member's id and nothing else, so the column used to
// print a raw UUID on every row — forty characters that are the same shape for
// everyone, which is the one thing a reader scanning "who ran this?" cannot
// use. The roster (useUsageMembers) turns the id into a person; this draws it.
//
// A row the roster cannot name is NOT dropped and not blanked: a generation
// billing wrote alone has no user_id, and a member who has since left the
// company is no longer on the roster. Both keep an avatar — a neutral one, so
// the eye can tell at a glance which rows are attributed — and the elided id
// beside it, with the whole id on the title for anything that has to be pasted
// into a support request.

/**
 * What the column PRINTS for a member id, and what it says on hover.
 *
 * `fallbackName` is the name the SOURCE supplied, for the sources that have
 * one: the real `/ai-spend` stores only the id and passes it here as the name,
 * but the seeded mock the view math is tested against names its members. It is
 * used only when the roster has nothing and it is not just the id again.
 */
export function memberDisplay(
  id: string,
  members: Map<string, CompanyMember>,
  fallbackName = "",
): { label: string; title: string; known: boolean } {
  if (id === "") {
    // Billing booked the charge without a submitter — see the AISpendRowWire
    // note: a client too old to be recognised carries the credits alone.
    return { label: "—", title: "", known: false };
  }
  const member = members.get(id);
  if (!member) {
    const supplied = fallbackName.trim();
    if (supplied !== "" && supplied !== id) {
      return { label: supplied, title: id, known: true };
    }
    return { label: shortUserId(id), title: id, known: false };
  }
  // The email is the disambiguator when two colleagues share a first name; the
  // id stays reachable behind it because it is what the filter sends back.
  return {
    label: member.name,
    title: member.email ? `${member.email}\n${id}` : id,
    known: true,
  };
}

export function MemberAvatar({
  id,
  member,
  fallbackName = "",
  className,
}: {
  id: string;
  member: CompanyMember | undefined;
  /** The name to take initials from when the roster has no entry — see
   *  `memberDisplay`. Empty means the row is unattributed. */
  fallbackName?: string;
  className?: string;
}) {
  const name = member?.name ?? fallbackName.trim();
  const email = member?.email ?? "";
  // No name and no email from either side: the row is unattributed, and the
  // circle says so rather than wearing a colour hashed from an id.
  const initials = name === "" && email === "" ? "" : memberInitials(name, email);
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        initials !== ""
          ? "text-white"
          : // An unnamed row gets the ground of the table rather than a colour
            // of its own: a hue hashed from an id nobody can read would look
            // like an identity the page does not actually have.
            "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
        className,
      )}
      style={initials !== "" ? { background: `hsl(${avatarHue(id)} 45% 42%)` } : undefined}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

export function MemberCell({
  id,
  members,
  fallbackName,
}: {
  id: string;
  members: Map<string, CompanyMember>;
  fallbackName?: string;
}) {
  const member = members.get(id);
  const { label, title, known } = memberDisplay(id, members, fallbackName);

  if (id === "") {
    return <span className="text-neutral-400 dark:text-neutral-500">{label}</span>;
  }

  return (
    <span className="flex items-center gap-2" title={title || undefined}>
      <MemberAvatar id={id} member={member} fallbackName={known ? label : ""} />
      <span
        className={cn(
          "truncate",
          known
            ? "font-medium text-neutral-900 dark:text-neutral-100"
            : // An id is not a name: it stays in the quieter ink the column had
              // before, and in tabular figures so the elided ids line up.
              "font-mono text-[12px] tabular-nums text-neutral-500 dark:text-neutral-400",
        )}
      >
        {label}
      </span>
    </span>
  );
}
