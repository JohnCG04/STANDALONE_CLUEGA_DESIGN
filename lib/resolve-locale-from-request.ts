import { type LanguageCode } from "@/i18n/config";

const ZH_COUNTRIES = new Set(["CN", "HK", "TW", "MO"]);

export function countryCodeToLanguage(
  countryCode: string | null | undefined,
): LanguageCode {
  if (!countryCode) {
    return "en";
  }

  const code = countryCode.toUpperCase();
  if (ZH_COUNTRIES.has(code)) {
    return "zh";
  }
  if (code === "VN") {
    return "vn";
  }
  return "en";
}

function resolveFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): LanguageCode | null {
  if (!acceptLanguage) {
    return null;
  }

  const lower = acceptLanguage.toLowerCase();
  if (lower.includes("zh")) {
    return "zh";
  }
  if (lower.includes("vi")) {
    return "vn";
  }
  if (lower.includes("en")) {
    return "en";
  }
  return null;
}

function readCountryCode(headerStore: Headers): string | null {
  const candidates = [
    headerStore.get("x-vercel-ip-country"),
    headerStore.get("cf-ipcountry"),
    headerStore.get("x-country-code"),
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }
    const code = value.trim().toUpperCase();
    if (code && code !== "XX" && code !== "T1") {
      return code;
    }
  }

  return null;
}

/** Resolve locale from CDN geo headers, then Accept-Language, else English. */
export function resolveLocaleFromRequest(headerStore: Headers): LanguageCode {
  const country = readCountryCode(headerStore);
  if (country) {
    return countryCodeToLanguage(country);
  }

  return resolveFromAcceptLanguage(headerStore.get("accept-language")) ?? "en";
}
