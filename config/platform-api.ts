import { envOrDefault } from "@/lib/env";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const platformApiConfig = {
  // A blank build arg must not collapse this to "", or every /v1/me call becomes
  // same-origin and permissions silently break — the failure the Dockerfile
  // comment on NEXT_PUBLIC_MID_PLATFORM_API_URL describes.
  baseUrl: trimTrailingSlash(
    envOrDefault(
      process.env.NEXT_PUBLIC_MID_PLATFORM_API_URL,
      "http://localhost:8090",
    ),
  ),
  mePath: "/v1/me",
} as const;
