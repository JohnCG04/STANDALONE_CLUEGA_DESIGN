export const nativeAuthCallback = {
  host: "auth",
  path: "callback",
} as const;

export const nativeAuthPlatforms = {
  desktop: {
    callbackScheme:
      process.env.NEXT_PUBLIC_DESKTOP_CALLBACK_SCHEME ?? "com.cluega.desktop",
  },
  ios: {
    callbackScheme:
      process.env.NEXT_PUBLIC_IOS_CALLBACK_SCHEME ?? "com.cluega.ios",
  },
  android: {
    callbackScheme:
      process.env.NEXT_PUBLIC_ANDROID_CALLBACK_SCHEME ?? "com.cluega.android",
  },
} as const;

export type NativeAuthPlatform = keyof typeof nativeAuthPlatforms;

export const nativeAuthFlowTypes = ["signIn", "signUp"] as const;

export type NativeAuthFlowType = (typeof nativeAuthFlowTypes)[number];

export const enabledNativePlatforms: NativeAuthPlatform[] = ["desktop"];

export const demoAuthConfig = {
  demoEmail: "demo@cluega.com",
  demoPassword: "cluega-demo",
  demoDisplayName: "Cluega Demo",
  demoAccessToken: "cluega-demo-access-token",
  googleDemoEmail: "demo-google@cluega.com",
  googleDemoDisplayName: "Cluega Google",
  googleDemoAccessToken: "cluega-google-demo-access-token",
} as const;

export function buildNativeAuthCallbackUrl(params: {
  platform: NativeAuthPlatform;
  nonce: string;
  email: string;
  displayName: string;
  token: string;
  refreshToken: string;
}): string {
  const scheme = nativeAuthPlatforms[params.platform].callbackScheme;
  const url = new URL(
    `${scheme}://${nativeAuthCallback.host}/${nativeAuthCallback.path}`,
  );
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("email", params.email);
  url.searchParams.set("display_name", params.displayName);
  url.searchParams.set("token", params.token);
  url.searchParams.set("refresh_token", params.refreshToken);
  return url.toString();
}
