"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

/**
 * Which columns the directory table shows, remembered per browser.
 *
 * "Member" is not in the list: a roster row without a name is not a row, so
 * hiding it would be an option nobody should have. Everything else is optional.
 */

export type DirectoryColumnId = "member" | "email" | "role" | "department" | "status" | "created";

export type ColumnVisibility = Record<Exclude<DirectoryColumnId, "member">, boolean>;

const STORAGE_KEY = "cluega.settings.team.directory.columns";

/**
 * Defaults chosen for the settings modal's width, not for completeness:
 * "created" is off because six columns fit and seven start scrolling sideways
 * on the first open, which reads as a broken layout rather than a rich one.
 */
const DEFAULTS: ColumnVisibility = {
  email: true,
  role: true,
  department: true,
  status: true,
  created: false,
};

const LABEL_KEYS: Record<keyof ColumnVisibility, string> = {
  email: "settings.team.dirColEmail",
  role: "settings.team.dirColRole",
  department: "settings.team.dirColDepartment",
  status: "settings.team.dirColStatus",
  created: "settings.team.dirColCreated",
};

export function useDirectoryColumns() {
  const [columns, setColumns] = useState<ColumnVisibility>(DEFAULTS);

  // Read after mount, never during render: the server has no localStorage, and
  // reading it in the initial state would hydrate one markup over another.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ColumnVisibility>;
      // Merged onto DEFAULTS rather than spread over them, so a stored object
      // written before a column existed does not blank the new column out.
      setColumns((prev) => {
        const next = { ...DEFAULTS, ...prev };
        for (const key of Object.keys(DEFAULTS) as (keyof ColumnVisibility)[]) {
          if (typeof parsed[key] === "boolean") next[key] = parsed[key];
        }
        return next;
      });
    } catch {
      /* A browser that refuses storage still gets the defaults. */
    }
  }, []);

  const toggleColumn = useCallback((id: keyof ColumnVisibility) => {
    setColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* Not being able to remember the choice must not prevent making it. */
      }
      return next;
    });
  }, []);

  const isVisible = useCallback(
    (id: DirectoryColumnId) => (id === "member" ? true : columns[id]),
    [columns],
  );

  return { columns, toggleColumn, isVisible };
}

export function DirectoryColumnsMenu({
  columns,
  onToggle,
}: {
  columns: ColumnVisibility;
  onToggle: (id: keyof ColumnVisibility) => void;
}) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  const updateMenuPosition = () => {
    const rect = wrapRef.current?.querySelector("button")?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ left: rect.right - 208, top: rect.bottom + 6 });
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    updateMenuPosition();
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-[12px]"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          updateMenuPosition();
          setOpen((v) => !v);
        }}
      >
        {t("settings.team.dirColumns")}
        <ChevronDown className="size-3.5" />
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          className="fixed z-[100] w-52 rounded-xl border border-border bg-popover p-1.5 shadow-xl"
        >
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("settings.team.dirColumnsTitle")}
          </p>
          {(Object.keys(columns) as (keyof ColumnVisibility)[]).map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemcheckbox"
              onClick={() => onToggle(id)}
              aria-pressed={columns[id]}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  columns[id] ? "border-foreground bg-foreground" : "border-border",
                )}
              >
                {columns[id] ? <Check className="size-3 text-background" /> : null}
              </span>
              {t(LABEL_KEYS[id])}
            </button>
          ))}
          <p className="border-t border-border px-2 pb-1 pt-1.5 text-[10px] leading-snug text-muted-foreground">
            {t("settings.team.dirColumnsHint")}
          </p>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
