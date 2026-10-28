import { envOrDefault } from '@/lib/env';
import { splitLanguageFromPathname } from '@/i18n/config';
import { siteConfig } from '@/config/site';

export const HELP_CENTER_PATH = '/help';
const LANDING_DEV_PORT = '3000';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const PRODUCT_DOMAIN = 'cluega.ai';
const HELP_DOMAIN = 'cluega.com';

type HelpCenterEnv = {
  HELP_ZONE_URL?: string;
  NEXT_PUBLIC_HELP_ZONE_URL?: string;
  [key: string]: string | undefined;
};

export type HelpCenterHost = {
  host: string;
  protocol?: string;
  env?: HelpCenterEnv;
};

export function isHelpCenterPath(pathname: string): boolean {
  const { pathname: bare } = splitLanguageFromPathname(pathname);

  return bare === HELP_CENTER_PATH || bare.startsWith(`${HELP_CENTER_PATH}/`);
}

function normalizeOrigin(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  try {
    return new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).origin;
  } catch {
    return '';
  }
}

function parseRequestUrl(host: string, protocol?: string): URL | null {
  const authority = host.split(',')[0]?.trim();
  if (!authority) return null;

  const scheme = protocol?.split(',')[0]?.trim() || 'https';

  try {
    return new URL(`${scheme}://${authority}`);
  } catch {
    return null;
  }
}

function deriveFromHost(requested: URL): string {
  const { hostname, protocol } = requested;

  if (LOCAL_HOSTNAMES.has(hostname)) {
    return `${protocol}//${hostname}:${LANDING_DEV_PORT}`;
  }

  if (hostname === HELP_DOMAIN || hostname.endsWith(`.${HELP_DOMAIN}`)) {
    return '';
  }

  if (hostname === PRODUCT_DOMAIN || hostname.endsWith(`.${PRODUCT_DOMAIN}`)) {
    const prefix = hostname.slice(0, hostname.length - PRODUCT_DOMAIN.length);
    return `https://${prefix}${HELP_DOMAIN}`;
  }
  return normalizeOrigin(siteConfig.url);
}

export function resolveHelpCenterOrigin({
  host,
  protocol,
  env = process.env,
}: HelpCenterHost): string {
  const requested = parseRequestUrl(host, protocol);
  const configured = normalizeOrigin(
    envOrDefault(env.HELP_ZONE_URL, env.NEXT_PUBLIC_HELP_ZONE_URL, ''),
  );

  if (!requested) return configured;

  const resolved = configured || deriveFromHost(requested);
  if (!resolved) return '';

  return new URL(resolved).host === requested.host ? '' : resolved;
}

export function resolveHelpCenterRedirect({
  host,
  protocol,
  pathname,
  search = '',
  env = process.env,
}: HelpCenterHost & { pathname: string; search?: string }): string | null {
  if (!isHelpCenterPath(pathname)) return null;

  const origin = resolveHelpCenterOrigin({ host, protocol, env });
  if (!origin) return null;

  return `${origin}${pathname}${search}`;
}

/**
 * Absolute href for a path only the landing zone serves, for a component that
 * renders in both zones. Returns `path` untouched on the landing zone itself
 * and during SSR, so the zone where the link already works is unaffected.
 */
export function landingZoneHref(path: string): string {
  if (typeof window === 'undefined') return path;

  const origin = resolveHelpCenterOrigin({
    host: window.location.host,
    protocol: window.location.protocol.replace(':', ''),
    env: { NEXT_PUBLIC_HELP_ZONE_URL: process.env.NEXT_PUBLIC_HELP_ZONE_URL },
  });

  return origin ? `${origin}${path}` : path;
}

export function helpCenterHref(path: string): string {
  return landingZoneHref(path);
}
