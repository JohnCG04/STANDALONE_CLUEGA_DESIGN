"use client";

import { CheckCircle2 } from "lucide-react";

/**
 * The Profile tab's confirmation toast.
 *
 * Pure presentation, extracted so the tab file is layout and state rather than
 * layout, state and forty lines of keyframes. The parent still owns the
 * show/hide lifecycle, because three different things on that tab confirm
 * through this one toast (a saved display name, an approved profile suggestion,
 * a saved context block) and they must not each get a toast of their own.
 */
export function ProfileSavedToast({
  message,
  isHiding,
}: {
  message: string;
  isHiding: boolean;
}) {
  return (
    <>
      <style>{`
        @keyframes toastSlideDown {
          0% {
            transform: translate(-50%, -45px);
            opacity: 0;
          }
          100% {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        @keyframes toastSlideUp {
          0% {
            transform: translate(-50%, 0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -45px);
            opacity: 0;
          }
        }
        .animate-toast-down {
          animation: toastSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-toast-up {
          animation: toastSlideUp 0.25s ease-in forwards;
        }
      `}</style>
      <div
        className={`fixed top-8 left-1/2 z-[100] ${
          isHiding ? "animate-toast-up" : "animate-toast-down"
        }`}
      >
        <div className="flex items-center gap-2.5 rounded-2xl bg-neutral-900 px-5 py-3 shadow-2xl border border-neutral-800 text-white">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" strokeWidth={2} />
          <span className="text-[14px] font-medium text-white">{message}</span>
        </div>
      </div>
    </>
  );
}
