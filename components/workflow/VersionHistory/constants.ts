import type { WorkflowActions } from "@dogclaw-ad/workflow";

// Required by the props contract, never invoked: a read-only canvas mounts no submit.
export const PREVIEW_ACTIONS: WorkflowActions = {
  generateImage: () => Promise.reject(new Error("read-only preview")),
  generateVideo: () => Promise.reject(new Error("read-only preview")),
};
