"use client";

import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

type TableProps = TableHTMLAttributes<HTMLTableElement>;
type TableSectionProps = HTMLAttributes<HTMLTableSectionElement>;
type TableRowProps = HTMLAttributes<HTMLTableRowElement>;
type TableHeadProps = ThHTMLAttributes<HTMLTableCellElement>;

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  columnKey?: string;
  columnWidthPx?: number;
};

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: TableSectionProps) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: TableSectionProps) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, children, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  children,
  columnWidthPx,
  style,
  className,
  ...props
}: TableCellProps) {
  return (
    <td
      className={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", className)}
      style={
        columnWidthPx == null
          ? style
          : {
              width: columnWidthPx,
              minWidth: columnWidthPx,
              maxWidth: columnWidthPx,
              ...style,
            }
      }
      {...props}
    >
      {children}
    </td>
  );
}
