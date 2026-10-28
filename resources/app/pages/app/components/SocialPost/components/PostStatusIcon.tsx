import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import type { SocialPostStatus } from "@/lib/social-posts/client";

/** One target's outcome at a glance: done, failed, waiting for its slot, or on its way. */
export function PostStatusIcon({ status }: { status: SocialPostStatus }) {
  if (status === "posted") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
  }
  if (status === "failed") {
    return <XCircle className="size-4 shrink-0 text-red-500" />;
  }
  if (status === "scheduled") {
    return <Clock className="size-4 shrink-0 text-neutral-400" />;
  }
  return <Loader2 className="size-4 shrink-0 animate-spin text-neutral-400" />;
}
