export const APP_AUTH_COOKIE = "app_auth";

type AppAuthPayload = {
  email: string;
  displayName: string;
  exp: number;
};

const APP_AUTH_PAYLOAD_VERSION = "v1";
const APP_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getAppAuthSecret(): string | undefined {
  return (
    process.env.APP_AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "cluega-app-auth-dev-secret")
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function signHmac(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

function encodePayload(payload: AppAuthPayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(value: string): AppAuthPayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as AppAuthPayload;
  } catch {
    return null;
  }
}

export function getAppAuthMaxAgeSeconds(): number {
  return APP_AUTH_MAX_AGE_SECONDS;
}

export async function createAppAuthToken(params: {
  email: string;
  displayName: string;
}): Promise<string> {
  const secret = getAppAuthSecret();
  if (!secret) {
    throw new Error("APP_AUTH_SECRET is not configured");
  }

  const payload = encodePayload({
    email: params.email,
    displayName: params.displayName,
    exp: Math.floor(Date.now() / 1000) + APP_AUTH_MAX_AGE_SECONDS,
  });
  const signedValue = `${APP_AUTH_PAYLOAD_VERSION}.${payload}`;
  const signature = await signHmac(secret, signedValue);

  return `${signedValue}.${signature}`;
}

export async function verifyAppAuthToken(token: string | undefined): Promise<boolean> {
  return (await getAppAuthSession(token)) !== null;
}

export type AppAuthSession = {
  email: string;
  displayName: string;
};

export async function getAppAuthSession(
  token: string | undefined,
): Promise<AppAuthSession | null> {
  if (!token) {
    return null;
  }

  const [version, payload, signature, ...rest] = token.split(".");
  if (rest.length > 0 || version !== APP_AUTH_PAYLOAD_VERSION || !payload || !signature) {
    return null;
  }

  const secret = getAppAuthSecret();
  if (!secret) {
    return null;
  }

  const signedValue = `${version}.${payload}`;
  const expectedSignature = await signHmac(secret, signedValue);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  const decoded = decodePayload(payload);
  if (!decoded?.exp || decoded.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    email: decoded.email,
    displayName: decoded.displayName,
  };
}
