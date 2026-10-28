"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/30 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    overlayClassName?: string;
    container?: HTMLElement | null;
    /**
     * `right` docks the content to the viewport's right edge at full height and
     * slides it in, instead of centring it: a sheet, with the same focus trap,
     * Escape and scroll lock as every other dialog. Classes on the call site
     * cannot do this — the centring, the zoom and the rounded card would all
     * have to be fought through tailwind-merge one by one.
     */
    side?: "center" | "right";
  }
>(({ className, children, showCloseButton = false, overlayClassName, container, side = "center", ...props }, ref) => (
  <DialogPortal container={container ?? undefined}>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        side === "right"
          ? "fixed inset-y-0 right-0 z-50 h-full border-l border-border"
          : "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        // A FLOOR under every dialog on a phone, and the reason it has to live
        // here rather than at the call sites: this box is centred with
        // `-translate-x-1/2`, so one wider than the viewport bleeds off BOTH
        // edges equally and there is no scroll position that brings either
        // back. 37 of the 126 dialogs in the product set no width cap at all —
        // a `w-[420px]` confirm on a 390px phone was unreadable and unclosable.
        //
        // A cap, not a width: `max-w-*` and `w-*` are different tailwind-merge
        // groups, so a call site's own width still applies underneath it, and
        // the 89 dialogs that already pass a `max-w` keep theirs — theirs comes
        // later in the merge and wins.
        "max-w-[calc(100vw-2rem)]",
        "min-w-[320px]",
        side === "right"
          ? "overflow-y-auto bg-card text-foreground shadow-2xl"
          : "max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-card text-foreground shadow-2xl ring-1 ring-border",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        side === "right"
          ? "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          : ["data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0", "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"],
        "duration-200",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-md p-1.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Close"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-xl font-semibold tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
};
