import {
  JobPollTimeoutError,
  pollJobImageUrls,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { RESIZE_FEATURE } from "./constants";

/** The url, not an Asset: the run reads its pixels back to paste the original over. */
export async function resolveExpandedUrl(
  jobId: string,
  signal?: AbortSignal,
): Promise<string> {
  let urls: string[];
  try {
    urls = await pollJobImageUrls(jobId, signal);
  } catch (err) {
    // A job we stopped watching is not a job that came back empty.
    if (err instanceof JobPollTimeoutError) {
      throw new Error(
        MEDIA_JOB_MESSAGES.stillRunning(RESIZE_FEATURE, err.budgetMs),
      );
    }
    throw err;
  }

  if (urls.length === 0) {
    throw new Error(MEDIA_JOB_MESSAGES.noImageUrl(RESIZE_FEATURE));
  }
  return urls[0];
}
