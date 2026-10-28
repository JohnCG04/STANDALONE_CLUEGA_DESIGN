import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:border-neutral-300 focus-visible:ring-[3px] focus-visible:ring-muted disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      // Light hovers are neutral-100 (#F5F5F5), the sidebar's and the model
      // list's: --muted is a warm grey that read beige (asked for, 2026-10-06).
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        primary:
          "bg-neutral-900 text-white shadow-xs hover:bg-neutral-800 focus-visible:ring-neutral-400/30 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border bg-background shadow-xs hover:bg-neutral-100 dark:hover:bg-muted hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-neutral-100 dark:hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        subtle:
          "border border-border/70 bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        quiet: "text-muted-foreground hover:bg-neutral-100 dark:hover:bg-muted hover:text-foreground",
        circle:
          "rounded-full border border-border text-muted-foreground hover:border-foreground/20 hover:bg-neutral-100 dark:hover:bg-muted hover:text-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
        compact: "h-9 px-2.5 text-[13px]",
        sidebarChild: "h-8 px-2.5 py-0 text-[12px] leading-[18px]",
        pill: "h-9 rounded-full px-4 text-[13px]",
        pillCompact: "h-9 rounded-full px-3 text-[13px] font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
