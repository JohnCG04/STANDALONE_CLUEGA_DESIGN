import {
  buildNativeAuthCallbackUrl,
  enabledNativePlatforms,
  type NativeAuthFlowType,
  type NativeAuthPlatform,
  nativeAuthFlowTypes,
  nativeAuthPlatforms,
} from "@/config/auth";
import { CdpApiError } from "@/lib/cdp";
import { loginWithPasswordViaCdp } from "@/lib/cdp-auth-client";

export type NativeLoginContext = {
  from: NativeAuthPlatform | null;
  type: NativeAuthFlowType | null;
  nonce: string | null;
};

const nativePlatformSet = new Set<string>(Object.keys(nativeAuthPlatforms));

function isNativeAuthPlatform(value: string | null): value is NativeAuthPlatform {
  return value !== null && nativePlatformSet.has(value);
}

function isNativeAuthFlowType(value: string | null): value is NativeAuthFlowType {
  return value !== null && nativeAuthFlowTypes.includes(value as NativeAuthFlowType);
}

export function readNativeLoginContext(searchParams: URLSearchParams): NativeLoginContext {
  const legacyClient = searchParams.get("client");
  const legacyState = searchParams.get("state");
  const fromParam = searchParams.get("from") ?? legacyClient;
  const from = isNativeAuthPlatform(fromParam) ? fromParam : null;

  const typeParam = searchParams.get("type") ?? "signIn";
  const type = isNativeAuthFlowType(typeParam) ? typeParam : null;

  const nonce = searchParams.get("nonce") ?? legacyState;

  return { from, type, nonce };
}

export function hasNativeLoginEntryParams(context: NativeLoginContext): boolean {
  return Boolean(context.nonce?.trim()) && context.from !== null;
}

export function validateNativeLoginContext(context: NativeLoginContext): string | null {
  if (!context.nonce) {
    return "missingNonce";
  }

  if (!context.from) {
    return "unsupportedPlatform";
  }

  if (!enabledNativePlatforms.includes(context.from)) {
    return "platformNotReady";
  }

  if (!context.type) {
    return "unsupportedFlow";
  }

  return null;
}

export function redirectToNativeApp(params: {
  platform: NativeAuthPlatform;
  nonce: string;
  email: string;
  displayName: string;
  token: string;
  refreshToken: string;
}): void {
  const callbackUrl = buildNativeAuthCallbackUrl(params);
  window.location.assign(callbackUrl);
}

export async function authenticateWithPassword(
  email: string,
  password: string,
  tenantId?: string,
): Promise<{ email: string; displayName: string; token: string; refreshToken: string }> {
  try {
    return await loginWithPasswordViaCdp(email, password, undefined, tenantId);
  } catch (error) {
    if (error instanceof CdpApiError && error.code === "invalid_credentials") {
      throw new Error("invalidCredentials");
    }
    throw error;
  }
}

export function authenticateWithGoogle(): never {
  throw new Error("googleNotSupported");
}
