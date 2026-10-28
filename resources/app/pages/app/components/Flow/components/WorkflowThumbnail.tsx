"use client";

import { useState } from "react";
import { Waypoints } from "lucide-react";

import { cn } from "@/lib/utils";
import { STILL_SEEK } from "@/lib/media/attachmentThumb";

import { SignedImg, SignedVideo } from "@/components/media/SignedMedia";

import type { FlowProjectCoverType } from "../services/flow-builder.service";

const EmptyThumbnail = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-200/70 dark:from-neutral-800/60 dark:to-neutral-900",
      className,
    )}
  >
    {/* subtle dotted grid backdrop */}
    <div
      aria-hidden
      className="absolute inset-0 opacity-[0.06] dark:opacity-[0.12]"
      style={{
        backgroundImage:
          "radial-gradient(currentColor 1px, transparent 1px)",
        backgroundSize: "12px 12px",
        color: "rgb(64 64 64)",
      }}
    />
    <div className="relative flex aspect-square w-[26%] max-w-9 min-w-6 items-center justify-center rounded-[22%] bg-white/70 text-neutral-400 ring-1 ring-neutral-900/[0.06] backdrop-blur-sm dark:bg-white/[0.06] dark:text-neutral-500 dark:ring-white/10">
      <Waypoints className="h-1/2 w-1/2" strokeWidth={1.75} />
    </div>
  </div>
);

interface CoverMediaProps {
  className?: string;
  src: string;
  type?: FlowProjectCoverType;
  alt?: string;
}

/** The cover itself; any load failure falls back to the empty tile, never a broken icon. */
const CoverMedia = ({ className, src, type, alt }: CoverMediaProps) => {
  const [failed, setFailed] = useState(false);
  const fail = () => setFailed(true);
  const mediaClass = cn("absolute inset-0 h-full w-full object-cover", className);

  if (failed) return <EmptyThumbnail className={className} />;

  if (type === "video") {
    return (
      <SignedVideo
        // A still, one frame in (frame zero of a fade-in is black): a grid never plays clips
        src={`${src}${STILL_SEEK}`}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-label={alt}
        className={cn("pointer-events-none", mediaClass)}
        onError={fail}
      />
    );
  }

  return (
    <SignedImg
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className={mediaClass}
      onError={fail}
    />
  );
};

/** A project or preset cover: image, video still, or the empty tile when there is none. */
export const WorkflowThumbnail = ({
  className,
  src,
  type,
  alt,
}: {
  className?: string;
  src?: string;
  type?: FlowProjectCoverType;
  alt?: string;
}) => {
  if (!src) return <EmptyThumbnail className={className} />;
  // Keyed by url, so a new cover gets a fresh load instead of an earlier failure.
  return <CoverMedia key={src} className={className} src={src} type={type} alt={alt} />;
};
