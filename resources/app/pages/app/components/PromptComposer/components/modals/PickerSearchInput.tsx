"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// All four picker modals put the same search field in their header slot, so it
// lives here once, on top of the shared Input primitive (which brings the
// focus ring and disabled handling the hand-rolled inputs were missing).

type PickerSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function PickerSearchInput({
  value,
  onChange,
  placeholder,
  className,
}: PickerSearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        // Input's default focus ring uses --ring (teal), which reads as an
        // accent colour the neutral picker modals don't use — focus stays a
        // border darkening, the way these search fields looked before.
        className="rounded-lg bg-transparent pl-8 text-[13px] shadow-none focus-visible:border-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:focus-visible:border-neutral-600"
      />
    </div>
  );
}
