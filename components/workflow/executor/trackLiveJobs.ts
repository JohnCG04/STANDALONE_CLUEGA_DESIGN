import type { FlowJobTrack } from "../shared/types";
import type { FlowJobsLedger } from "../jobs/types";
import type { JobSubmitter, LiveJobs } from "./types";

/** Record live job ids around a submit, and forget them when it settles. */
export function trackSubmits(
  ledger: JobSubmitter,
  liveJobs: LiveJobs,
): JobSubmitter {
  // `onCreated` may fire per creative, so ids accumulate; weak so an unsettled submit frees them.
  const bySubmit = new WeakMap<FlowJobTrack, string[]>();
  // The ledger keys its rows by the track IT issued, so a settle must hand that one back.
  const issued = new WeakMap<FlowJobTrack, FlowJobTrack>();

  /** Forget the submit's live ids; answers the ledger's own track for it. */
  const settle = (track: FlowJobTrack | undefined) => {
    if (!track) return track;
    const ids = bySubmit.get(track);
    if (ids) {
      liveJobs.forget(ids);
      bySubmit.delete(track);
    }
    return issued.get(track) ?? track;
  };

  return {
    beginSubmit(nodeId, kind) {
      const track = ledger.beginSubmit(nodeId, kind);
      // No track means the ledger is off; ids we could never map to a node stay unrecorded.
      if (!track) return track;
      const wrapped: FlowJobTrack = {
        ...track,
        onCreated: (jobIds, groupId) => {
          liveJobs.remember(jobIds);
          bySubmit.set(wrapped, [...(bySubmit.get(wrapped) ?? []), ...jobIds]);
          // Chained, not replaced: the ledger's handler writes the row the watcher and reload need.
          track.onCreated?.(jobIds, groupId);
        },
      };
      issued.set(wrapped, track);
      return wrapped;
    },

    completeSubmit(track) {
      // Settled jobs are no longer live, so a later Stop sends no cancels for work that landed.
      ledger.completeSubmit(settle(track));
    },

    stopSubmit(track) {
      // Its own jobs were cancelled by the action that watched them.
      ledger.stopSubmit(settle(track));
    },
  };
}

/** A ledger that also records live ids; pass-throughs are explicit so accessors stay live. */
export function trackLiveJobs(
  ledger: FlowJobsLedger,
  liveJobs: LiveJobs,
): FlowJobsLedger {
  const tracked = trackSubmits(ledger, liveJobs);
  return {
    get enabled() {
      return ledger.enabled;
    },
    get resumable() {
      return ledger.resumable;
    },
    get runsConfig() {
      return ledger.runsConfig;
    },
    adopt: (rows) => ledger.adopt(rows),
    markApplied: (ids) => ledger.markApplied(ids),
    markStopped: (ids) => ledger.markStopped(ids),
    discard: (ids) => ledger.discard(ids),
    noteStatus: (id, status, error) => ledger.noteStatus(id, status, error),
    beginSubmit: tracked.beginSubmit,
    completeSubmit: tracked.completeSubmit,
    stopSubmit: tracked.stopSubmit,
  };
}
