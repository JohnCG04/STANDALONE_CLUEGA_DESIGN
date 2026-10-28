/**
 * Server-Timing for the Pulse file upload, this proxy's half.
 *
 * A slow or failing upload does not say which hop it was slow in. This proxy,
 * the CDP backend and the Pulse bot service each add their own entries to the
 * response's Server-Timing header, so one upload read in the browser's network
 * panel shows where its time went:
 *
 * - `next-read`: the browser sending the file to this server, which buffers it
 *   whole before forwarding
 * - `next-upstream`: forwarding it, until the backend's response headers arrive
 *
 * Durations only: the header is readable by whoever made the request, so
 * nothing in it names the file, the user or the tenant.
 */

const TIMED_UPLOAD_PATH = "pulse/rakazo/rpc/artifacts/create";

/** Only the upload is timed; every other call keeps its response as it was. */
export function isTimedUpload(pathSegments: readonly string[]): boolean {
  return pathSegments.join("/") === TIMED_UPLOAD_PATH;
}

export class UploadTiming {
  private last: number;
  private readonly recorded: { name: string; dur: number }[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {
    this.last = now();
  }

  /** Records the time since the previous lap, or since construction for the first. */
  lap(name: string): void {
    const at = this.now();
    this.recorded.push({ name, dur: at - this.last });
    this.last = at;
  }

  header(): string {
    return this.recorded
      .map(({ name, dur }) => `${name};dur=${dur.toFixed(1)}`)
      .join(", ");
  }
}

/**
 * The full header for the browser: this proxy's entries first, since its hop
 * came first, then whatever the backend sent.
 */
export function uploadServerTiming(
  timing: UploadTiming,
  upstream: string | null,
): string {
  return upstream ? `${timing.header()}, ${upstream}` : timing.header();
}
