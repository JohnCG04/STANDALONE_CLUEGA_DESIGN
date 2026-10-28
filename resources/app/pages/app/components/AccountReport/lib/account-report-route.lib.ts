"use client";

export type AccountReportPlatformCode = "t" | "m" | "h";

export type AccountReportPlatform = "tiktokAds" | "metaAds" | "googleAds";

export type MarketingPlatformServiceId =
  | "tiktokAds"
  | "meta"
  | "googleAds";

export const DEFAULT_ACCOUNT_REPORT_PLATFORM_CODE: AccountReportPlatformCode = "t";
export const DEFAULT_ACCOUNT_REPORT_PLATFORM: AccountReportPlatform = "tiktokAds";

const PLATFORM_CODE_TO_PLATFORM: Record<
  AccountReportPlatformCode,
  AccountReportPlatform
> = {
  t: "tiktokAds",
  m: "metaAds",
  h: "googleAds",
};

const PLATFORM_TO_CODE: Record<AccountReportPlatform, AccountReportPlatformCode> = {
  tiktokAds: "t",
  metaAds: "m",
  googleAds: "h",
};

/**
 * Codes that are still accepted on the way in but are never emitted again.
 *
 * Google Ads was addressed as `g` before the platform codes were aligned with
 * the product spec's `t` / `m` / `h`. Every link already sent, bookmarked, or
 * stored as an OAuth return URL carries the old letter, so parsing keeps
 * honouring it — dropping it would silently land those users on TikTok, which
 * is the one failure mode this table exists to prevent. `PLATFORM_TO_CODE` is
 * the only source for building a URL, so nothing writes `g` any more.
 */
const LEGACY_PLATFORM_CODE_TO_PLATFORM: Record<string, AccountReportPlatform> = {
  g: "googleAds",
};

export const ACCOUNT_REPORT_PLATFORM_LABEL: Record<AccountReportPlatform, string> = {
  tiktokAds: "TikTok Ads",
  metaAds: "meta",
  googleAds: "Google Ads",
};

export const ACCOUNT_REPORT_PLATFORM_SERVICE_ID: Record<
  AccountReportPlatform,
  MarketingPlatformServiceId
> = {
  tiktokAds: "tiktokAds",
  metaAds: "meta",
  googleAds: "googleAds",
};

export function normalizeAccountReportPlatform(
  value: string | null | undefined,
): AccountReportPlatform {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return DEFAULT_ACCOUNT_REPORT_PLATFORM;

  if (normalized === "t" || normalized === "m" || normalized === "h") {
    return PLATFORM_CODE_TO_PLATFORM[normalized];
  }

  const legacy = LEGACY_PLATFORM_CODE_TO_PLATFORM[normalized];
  if (legacy) return legacy;

  switch (normalized) {
    case "meta":
    case "metaads":
      return "metaAds";
    case "google":
    case "googleads":
      return "googleAds";
    case "tiktok":
    case "tiktokads":
    default:
      return DEFAULT_ACCOUNT_REPORT_PLATFORM;
  }
}

export function accountReportPlatformToCode(
  platform: AccountReportPlatform,
): AccountReportPlatformCode {
  return PLATFORM_TO_CODE[platform];
}

export function parseAccountReportPlatformCode(
  value: string | null | undefined,
): AccountReportPlatformCode {
  return accountReportPlatformToCode(normalizeAccountReportPlatform(value));
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: unknown,
) {
  if (typeof value === "string" && value.trim()) {
    params.set(key, value.trim());
  }
}

/**
 * The two parameters that carry a period into the report.
 *
 * Named here rather than inline because they are a CONTRACT between this builder and
 * `parseAccountReportDateRange` below: a caller that emits one and a screen that reads
 * the other is the definition of a dead query parameter.
 */
export const ACCOUNT_REPORT_START_DATE_PARAM = "start_date";
export const ACCOUNT_REPORT_END_DATE_PARAM = "end_date";
/**
 * The saved report a Master Report was opened from. Carried only so the page
 * can remember how its reader left it (master-report-view-state.lib); it
 * changes nothing about which rows are read.
 */
export const ACCOUNT_REPORT_REPORT_ID_PARAM = "report_id";

/**
 * What both report URLs can carry.
 *
 * ADDITIVE ONLY. Five call sites already depend on these builders — the account list,
 * the account view and its ad-plan tab on `buildAccountReportUrl`; §4.9's Master-Report
 * list and the Optimizer's "Open in Master Report" on `buildMasterReportUrl` — so a
 * field they do not pass must emit no parameter and leave their URLs byte-identical.
 * `appendOptionalParam` skips absent values, which is what makes that true; there are
 * tests pinning both.
 *
 * `startDate`/`endDate` are `YYYY-MM-DD` and are consumed by
 * `parseAccountReportDateRange`. They exist so a reader arriving from another report
 * keeps the period they were looking at instead of being reset to the default week.
 *
 * There is deliberately NO timezone parameter: neither report route has a timezone
 * model at all — their rows come from ad_manager's own day buckets — so a `tz` here
 * would be a parameter nothing reads. See the handoff for why that gap was not closed
 * in this change.
 */
export type ReportRouteInput = {
  advertiserId?: string;
  /**
   * Every account a MERGED master report covers, `advertiserId` included.
   *
   * The route used to carry one account and nothing else, and two filed defects
   * came out of that single omission. The screen could not sum a report's six
   * accounts because it never learned there were six (BUG-502), and its account
   * picker fell back to listing every authorized advertiser in the tenant —
   * accounts belonging to other clients and other markets — because "the report
   * this screen was opened from" was not a thing the URL could express
   * (BUG-513).
   *
   * Emitted only when there are TWO OR MORE: one account is already fully
   * described by `advertiserId`, and a redundant list would change the URL of
   * every single-account report for no gain.
   */
  advertiserIds?: string[];
  /**
   * Which ONE of `advertiserIds` the reader is looking at, or absent for all.
   *
   * The merged report needed a second thing to say. `advertiserIds` answers
   * "which accounts does this report cover", and that is a property of the
   * saved definition — it must not change when somebody narrows the view, or
   * the account picker would shrink to the one account already chosen and
   * there would be no way back to the merge.
   *
   * So the view is its own parameter, and ABSENT MEANS ALL. That keeps every
   * existing merged link opening exactly as it does today, and makes the
   * narrowed view the thing that has to say so.
   *
   * Ignored unless `advertiserIds` names two or more accounts: with one
   * account there is nothing to narrow, and "the only account" and "all
   * accounts" are the same screen.
   */
  accountView?: string;
  planId?: string;
  createdAt?: string;
  platform?: AccountReportPlatform | AccountReportPlatformCode;
  campaignId?: string;
  campaignName?: string;
  adgroupId?: string;
  adgroupName?: string;
  adId?: string;
  from?: string;
  /** `YYYY-MM-DD`. Emitted only when BOTH ends are present — see below. */
  startDate?: string;
  endDate?: string;
  /** See ACCOUNT_REPORT_REPORT_ID_PARAM. */
  reportId?: string;
};

export function buildAccountReportUrl(input?: ReportRouteInput) {
  return `/app/account-report?${buildReportRouteParams(input)}`;
}

/**
 * The Master Report URL — §4.9's agency report, at a path of its own.
 *
 * Same query contract as `buildAccountReportUrl` on purpose: the two screens
 * are forks of one implementation and both open on an advertiser, a platform,
 * an optional drill-down scope and an optional period, so a reader following a
 * link from one to the other keeps everything the URL can carry. What differs
 * is the screen the path resolves to — Master Report renders the dimension /
 * metric workbench, Account Report the account's own report — which is exactly
 * why they stopped sharing a path.
 *
 * 【中文】大報表自己的網址。查詢參數與帳戶報表相同，只有路徑不同。
 */
export function buildMasterReportUrl(input?: ReportRouteInput) {
  return `/app/master-report?${buildReportRouteParams(input)}`;
}

/**
 * The query string both report routes carry.
 *
 * Extracted rather than duplicated so the two can never drift: a parameter added
 * for one screen is a parameter the other keeps carrying, which is what makes a
 * link between them lossless. `buildAccountReportUrl`'s output is pinned
 * byte-for-byte by tests, so this reproduces its ordering exactly — `p` first,
 * then `advertiser_id`, then the optional scope, then the period.
 */
function buildReportRouteParams(input?: ReportRouteInput) {
  const params = new URLSearchParams();
  const advertiserId = input?.advertiserId?.trim();
  const platform = input?.platform
    ? normalizeAccountReportPlatform(input.platform)
    : DEFAULT_ACCOUNT_REPORT_PLATFORM;

  params.set("p", accountReportPlatformToCode(platform));
  if (advertiserId) {
    params.set("advertiser_id", advertiserId);
  }
  appendOptionalParam(params, "plan_id", input?.planId);
  appendOptionalParam(params, "created_at", input?.createdAt);

  appendOptionalParam(params, "campaign_id", input?.campaignId);
  appendOptionalParam(params, "campaign_name", input?.campaignName);
  appendOptionalParam(params, "adgroup_id", input?.adgroupId);
  appendOptionalParam(params, "adgroup_name", input?.adgroupName);
  appendOptionalParam(params, "ad_id", input?.adId);
  appendOptionalParam(params, "from", input?.from);
  appendOptionalParam(params, ACCOUNT_REPORT_REPORT_ID_PARAM, input?.reportId);

  /*
    The merged report's full account list.

    De-duplicated and order-preserving, with `advertiserId` kept first so the
    account the screen opens on is the one the rest of the URL already names.
    Absent for a single account, which is what keeps every existing caller's URL
    byte-identical — see ADDITIVE ONLY on ReportRouteInput.
  */
  const advertiserIds = uniqueTrimmed([
    input?.advertiserId,
    ...(input?.advertiserIds ?? []),
  ]);
  if (advertiserIds.length > 1) {
    params.set(ACCOUNT_REPORT_ADVERTISER_IDS_PARAM, advertiserIds.join(","));

    /*
      Narrowed to one of them. Only meaningful beside the list, and only for an
      account the list actually names — a view of an account this report does
      not cover is not a view, it is a different report, and emitting it would
      let a hand-edited URL put another client's numbers under this report's
      name (the defect BUG-513 was filed for).
    */
    const accountView = input?.accountView?.trim();
    if (accountView && advertiserIds.includes(accountView)) {
      params.set(ACCOUNT_REPORT_ACCOUNT_VIEW_PARAM, accountView);
    }
  }

  /*
    Both ends or neither.

    A half-specified range is worse than none: the reader would land on a report whose
    start is theirs and whose end is the default, which is a period nobody chose and
    which nothing on screen explains.
  */
  const startDate = input?.startDate?.trim();
  const endDate = input?.endDate?.trim();
  if (isAccountReportYmd(startDate) && isAccountReportYmd(endDate)) {
    params.set(ACCOUNT_REPORT_START_DATE_PARAM, startDate);
    params.set(ACCOUNT_REPORT_END_DATE_PARAM, endDate);
  }

  return params.toString();
}

/** Whether a string is a calendar day this route is willing to carry. */
function isAccountReportYmd(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The query key carrying a merged report's account list. */
export const ACCOUNT_REPORT_ADVERTISER_IDS_PARAM = "advertiser_ids";

/** The query key naming which single account of a merged report is in view. */
export const ACCOUNT_REPORT_ACCOUNT_VIEW_PARAM = "account_view";

/**
 * The one account a merged report is narrowed to, or undefined for all of them.
 *
 * Validated against the report's own list rather than returned raw. The
 * parameter is reader-editable and the screen it feeds decides which numbers
 * appear under the report's name, so an id the report does not cover is
 * discarded and the reader gets the merge — the answer that is always true —
 * instead of another account's figures.
 */
export function resolveAccountView(
  raw: string | null | undefined,
  advertiserIds: readonly string[],
): string | undefined {
  const value = raw?.trim();
  if (!value || advertiserIds.length < 2) return undefined;
  return advertiserIds.includes(value) ? value : undefined;
}

/** Trimmed, non-empty, first-wins de-duplication. */
function uniqueTrimmed(values: readonly (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/**
 * The account list a merged master report was opened with.
 *
 * Returns [] when the parameter is absent, which is the honest answer rather
 * than a guess: a screen that cannot tell "one account" from "the list was
 * dropped" is exactly how the picker came to offer every advertiser in the
 * tenant. Callers that want a usable scope fall back to `advertiser_id`
 * themselves, where "the one account named in the URL" is a fact and not an
 * assumption.
 */
export function parseAccountReportAdvertiserIds(
  params: URLSearchParams | null | undefined,
): string[] {
  return splitAdvertiserIdsParam(params?.get(ACCOUNT_REPORT_ADVERTISER_IDS_PARAM));
}

/**
 * The same parse, from the raw value.
 *
 * Exported because the Master Report reads its query through its own
 * `readSearchParam` helper, which accepts several key spellings and a
 * params-like object rather than a `URLSearchParams`. Sharing the splitting
 * rules — trim, drop blanks, first-wins de-duplication — is what stops the two
 * readers disagreeing about a hand-edited URL.
 */
export function splitAdvertiserIdsParam(
  raw: string | null | undefined,
): string[] {
  if (!raw) return [];
  return uniqueTrimmed(raw.split(","));
}

/**
 * The period a URL asks the report to open on, or null.
 *
 * Null covers every unusable case — absent, half-present, malformed, or reversed — and
 * the caller then keeps its own default. Returning a partial range instead would put a
 * period on screen that the address bar does not actually describe.
 *
 * Parsed with the local-midnight form (`new Date(y, m-1, d)`) rather than
 * `new Date("YYYY-MM-DD")`, because the latter is parsed as UTC and would land on the
 * previous day for every reader west of Greenwich.
 */
export function parseAccountReportDateRange(input: {
  get: (name: string) => string | null;
}): { from: Date; to: Date } | null {
  const from = accountReportYmdToDate(input.get(ACCOUNT_REPORT_START_DATE_PARAM));
  const to = accountReportYmdToDate(input.get(ACCOUNT_REPORT_END_DATE_PARAM));
  if (!from || !to) return null;
  if (from.getTime() > to.getTime()) return null;
  return { from, to };
}

function accountReportYmdToDate(value: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  // Rejects 2026-02-31 and friends: the Date constructor rolls them over silently, and
  // a rolled-over date is a period the reader did not ask for.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function buildAccountListUrl(input?: {
  platform?: AccountReportPlatform | AccountReportPlatformCode;
}) {
  const platform = input?.platform
    ? normalizeAccountReportPlatform(input.platform)
    : DEFAULT_ACCOUNT_REPORT_PLATFORM;
  const params = new URLSearchParams({
    p: accountReportPlatformToCode(platform),
  });
  return `/app/account-list?${params.toString()}`;
}

/**
 * Which kind of TikTok authorization the account-list screen is showing.
 *
 * TikTok is the one platform with several: the ADS account a business
 * authorizes for reporting and spend, the SOCIAL account (a Business Center ad
 * identity), and TikTok ONE. They are different objects with different
 * permissions and different consent flows, and putting them on one screen
 * without a separator is how a reader comes to look for their campaigns under a
 * creator.
 */
export type AccountListTab = "business" | "social" | "one";

const ACCOUNT_LIST_TABS: readonly AccountListTab[] = ["business", "social", "one"];

/** The query parameter that records the open tab. */
export const ACCOUNT_LIST_TAB_PARAM = "accountType";

export const DEFAULT_ACCOUNT_LIST_TAB: AccountListTab = "business";

/**
 * The tab named on a URL, or the default.
 *
 * Anything unrecognised falls back to `business` rather than erroring: this is
 * a view preference on a deep link, and a typo in one should land the reader on
 * the screen they were going to rather than on nothing.
 */
export function parseAccountListTab(raw: string | null | undefined): AccountListTab {
  const value = String(raw ?? "").trim().toLowerCase();
  return ACCOUNT_LIST_TABS.find((tab) => tab === value) ?? DEFAULT_ACCOUNT_LIST_TAB;
}

export function parseAccountListTabFromSearchParams(input: {
  get: (name: string) => string | null;
}): AccountListTab {
  return parseAccountListTab(input.get(ACCOUNT_LIST_TAB_PARAM));
}

/**
 * The same account-list URL with a different tab open.
 *
 * EVERY other parameter is copied through, repeated keys included: `p` is what
 * says which platform this screen is, and the rest is somebody's state — a
 * filter, a `from`, an analytics tag. A tab switch that dropped `p` would send
 * the reader to a different platform's screen.
 *
 * The default tab is written as an ABSENT parameter rather than
 * `accountType=business`, so the plain screen URL stays the one it has always
 * been and a shared link does not grow a parameter that says "the default".
 */
export function buildAccountListTabUrl(input: {
  tab: AccountListTab;
  search?: Iterable<[string, string]> | null;
}): string {
  const params = new URLSearchParams();
  for (const [key, value] of input.search ?? []) {
    if (key === ACCOUNT_LIST_TAB_PARAM) continue;
    params.append(key, value);
  }
  if (input.tab !== DEFAULT_ACCOUNT_LIST_TAB) {
    params.set(ACCOUNT_LIST_TAB_PARAM, input.tab);
  }
  const query = params.toString();
  return query ? `/app/account-list?${query}` : "/app/account-list";
}

export function buildAccountReportUnsupportedPlatformMessage(
  platform: AccountReportPlatform,
) {
  return `${ACCOUNT_REPORT_PLATFORM_LABEL[platform]} report API is not implemented yet.`;
}

/**
 * Whether `/app/account-report` can actually render this platform's numbers.
 *
 * Only TikTok can: the screen reads ad_manager, and no equivalent report route
 * exists for Meta or Google Ads yet — `assertSupportedAccountReportPlatform` in
 * lib/account-report/client.ts throws for both, which is the red
 * "…report API is not implemented yet" banner on the report page.
 *
 * Exported so callers can ask BEFORE navigating. A caller that links here for an
 * unsupported platform is not broken code — it is a working link to a dead end,
 * which is worse, because the reader has to read an error to learn it. §4.9's
 * Master-Report list is the first such caller: it can hold a Meta or Google
 * report definition long before there is a screen able to draw it.
 */
export function isAccountReportPlatformSupported(
  platform: AccountReportPlatform,
): boolean {
  return platform === "tiktokAds";
}

export function parseAccountReportPlatformFromSearchParams(input: {
  get: (name: string) => string | null;
}) {
  return normalizeAccountReportPlatform(input.get("p"));
}

/**
 * Query parameters the CDP OAuth callback appends to the return URL.
 *
 * Listed once here because two screens depend on the exact same set: the
 * Application Authorization page consumes them to reopen a bind flow, and the
 * account-list redirect below has to forward them untouched. A redirect that
 * dropped `connection_id` would land the user on the right platform with the
 * post-authorization step silently skipped.
 */
export const OAUTH_RETURN_QUERY_PARAMS = [
  "status",
  "connection_id",
  "connection_status",
  "error_code",
  "error_message",
] as const;

/**
 * The query parameter that names which platform's screen is open on
 * Application Authorization.
 *
 * This is the URL's record of the open screen, not a temporary callback
 * artifact: it survives the OAuth cleanup, a refresh, a bookmark and the browser
 * history. `p=t|m|h` belongs to `/app/account-list` and never appears here.
 */
export const APPLICATION_AUTHORIZATION_SERVICE_PARAM = "service";

/**
 * The catalog service id whose screen the URL asks for, or `null` for the
 * catalog itself.
 *
 * Whether that id names a real integration is the caller's business — this only
 * reports what was asked for. A blank or whitespace-only value is treated as
 * absent so `?service=` cannot open a screen for the empty string.
 */
export function parseApplicationAuthorizationServiceId(input: {
  get: (name: string) => string | null;
}): string | null {
  const raw = input.get(APPLICATION_AUTHORIZATION_SERVICE_PARAM);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The parameter that asks the screen to open its account picker on arrival.
 *
 * Deliberately separate from `service`. "Open Google Ads" and "open Google Ads
 * and start picking accounts" are different intents, and inferring the second
 * from the first meant a refresh or a bookmark of the plain screen URL reopened
 * the picker every time — the URL could not express "just show me the screen".
 *
 * Only callers that genuinely mean "go select accounts" set it: chat's
 * "select ad accounts" CTA. A card click, a settings link and a bookmark do not.
 * The OAuth callback does not need it either — a successful return is already
 * distinguishable by `status=success`.
 */
export const APPLICATION_AUTHORIZATION_AUTO_BIND_PARAM = "auto_bind";

/** Whether the URL asks for the account picker to open on arrival. */
export function parseApplicationAuthorizationAutoBind(input: {
  get: (name: string) => string | null;
}): boolean {
  return input.get(APPLICATION_AUTHORIZATION_AUTO_BIND_PARAM)?.trim() === "1";
}

/**
 * Platforms whose account management lives on Application Authorization rather
 * than on the account-list route.
 *
 * TikTok owns the `/app/account-list` screen (bound advertisers, spend
 * dashboard, status dashboard). Meta and Google Ads are managed on
 * `/app/integrations`, which already holds their connection, binding, Page and
 * account-settings flows. Keeping the split in one predicate is what stops a
 * second navigation system from growing: `?p=m` / `?p=h` stay valid, addressable
 * URLs and simply resolve to the one screen that can serve them.
 */
export function isApplicationAuthorizationPlatform(
  platform: AccountReportPlatform,
): boolean {
  return platform === "metaAds" || platform === "googleAds";
}

/**
 * The Application Authorization URL that opens one integration's screen.
 *
 * Keyed by catalog service id rather than by ad platform, because this screen
 * serves every connected integration — Meta, Google Ads, Instagram, Gmail — and
 * only three of those have an `AccountReportPlatform`.
 *
 * `search` is the source query string; only the OAuth callback parameters are
 * copied, so an unrelated parameter cannot leak into a screen that does not
 * understand it.
 */
/**
 * The ad account a TikTok Ad Identity authorization is being run FOR.
 *
 * Separate from `service`, which only says which screen to open. "Show me the
 * TikTok account screen" and "authorize a TikTok account for ad account X" are
 * different intents, and folding them together would make a plain bookmark of
 * the screen carry somebody else's advertiser.
 */
export const AD_IDENTITY_ADVERTISER_PARAM = "advertiser_id";

/** The catalog service id whose screen owns the ad-identity flow. */
export const AD_IDENTITY_SERVICE_ID = "tiktokAccount";

/**
 * The advertiser the URL names, or `null`.
 *
 * FAIL-CLOSED: whitespace is not an advertiser. Returning `null` rather than the
 * raw string is what lets the page refuse to call anything — an id that is only
 * spaces would otherwise reach the API and come back as somebody's confusing
 * 4xx instead of a plain "pick an ad account first".
 */
export function parseAdIdentityAdvertiserId(input: {
  get: (name: string) => string | null;
}): string | null {
  const raw = input.get(AD_IDENTITY_ADVERTISER_PARAM);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The URL that opens the TikTok account screen ready to authorize for one ad
 * account. This is the contract the chat side links to.
 *
 * Returns `null` for a blank advertiser instead of a URL without the parameter:
 * a link that silently drops the advertiser lands on a screen that cannot do
 * the thing the link promised, and the reader has no way to tell why.
 *
 * Built through URLSearchParams so an id carrying `&`, `#`, a space or a
 * non-ASCII character is encoded once and correctly — hand-joined query strings
 * are where that breaks.
 */
export function buildAdIdentityAuthorizationUrl(input: {
  advertiserId: string;
}): string | null {
  const advertiserId = input.advertiserId.trim();
  if (!advertiserId) return null;
  const params = new URLSearchParams({
    [APPLICATION_AUTHORIZATION_SERVICE_PARAM]: AD_IDENTITY_SERVICE_ID,
    [AD_IDENTITY_ADVERTISER_PARAM]: advertiserId,
  });
  return `/app/integrations?${params.toString()}`;
}

/**
 * Where "go back" lands when there is no history to return to.
 *
 * A fixed internal path, never a URL read off the query string: a `return_url`
 * parameter on a page that just completed an authorization is an open redirect
 * with a very good pretext.
 */
export const AD_IDENTITY_FALLBACK_RETURN_URL = "/app/integrations?service=tiktokAccount";

export function buildApplicationAuthorizationServiceUrl(input: {
  serviceId: string;
  /** Ask the screen to open its account picker on arrival. Off by default. */
  autoBind?: boolean;
  search?: URLSearchParams | { get: (name: string) => string | null } | null;
}) {
  const params = new URLSearchParams({
    [APPLICATION_AUTHORIZATION_SERVICE_PARAM]: input.serviceId,
  });
  if (input.autoBind) {
    params.set(APPLICATION_AUTHORIZATION_AUTO_BIND_PARAM, "1");
  }

  const source = input.search;
  if (source) {
    for (const key of OAUTH_RETURN_QUERY_PARAMS) {
      const value = source.get(key);
      if (typeof value === "string" && value.trim()) {
        params.set(key, value);
      }
    }
  }

  return `/app/integrations?${params.toString()}`;
}

/**
 * The Application Authorization URL for one ad platform — the destination the
 * `/app/account-list?p=m|h` redirect resolves to.
 */
export function buildApplicationAuthorizationUrl(input: {
  platform: AccountReportPlatform | AccountReportPlatformCode;
  search?: URLSearchParams | { get: (name: string) => string | null } | null;
}) {
  const platform = normalizeAccountReportPlatform(input.platform);
  return buildApplicationAuthorizationServiceUrl({
    serviceId: ACCOUNT_REPORT_PLATFORM_SERVICE_ID[platform],
    search: input.search,
  });
}

/**
 * The Application Authorization URL with no platform screen open — the catalog.
 *
 * Used when closing a platform's account list: the open screen is recorded in
 * the URL, so closing it has to remove that record or a refresh would reopen
 * what the user just left.
 *
 * Only the service marker and the spent OAuth parameters are dropped. Anything
 * else on the URL is somebody's state — a filter, a `from`, an analytics tag —
 * and is copied through, including repeated keys.
 */
export function buildApplicationAuthorizationCatalogUrl(input?: {
  /** Any [key, value] iterable — `URLSearchParams` and Next's readonly variant both qualify. */
  search?: Iterable<[string, string]> | null;
}) {
  const dropped = new Set<string>([
    APPLICATION_AUTHORIZATION_SERVICE_PARAM,
    APPLICATION_AUTHORIZATION_AUTO_BIND_PARAM,
    ...OAUTH_RETURN_QUERY_PARAMS,
  ]);

  const params = new URLSearchParams();
  for (const [key, value] of input?.search ?? []) {
    if (dropped.has(key)) continue;
    params.append(key, value);
  }

  const query = params.toString();
  return query ? `/app/integrations?${query}` : "/app/integrations";
}

/**
 * How to leave a platform screen: pop the entry we pushed, or rewrite in place.
 */
export type ApplicationAuthorizationCloseAction =
  | { kind: "back" }
  | { kind: "replace"; url: string };

/**
 * Decides how closing a platform screen should touch session history.
 *
 * Pure so the choice can be exercised against a history model rather than
 * inferred from the component, because the failure it prevents is only visible
 * in the *stack*, not on the current page:
 *
 *   push(screen) then replace(catalog) leaves [catalog, catalog]. Browser Back
 *   moves the cursor between two entries that render the same thing, so it looks
 *   broken, and Forward can never return to the screen because that entry was
 *   overwritten.
 *
 *   push(screen) then back() leaves [catalog, screen] with the cursor on the
 *   catalog: Back is meaningful and Forward reopens the screen.
 *
 * `pushedScreenEntry` is false for a deep link or a refresh — there is no entry
 * of ours to pop, and `back()` would walk out of the app — so those rewrite the
 * current entry instead.
 */
export function resolveApplicationAuthorizationClose(input: {
  pushedScreenEntry: boolean;
  search?: Iterable<[string, string]> | null;
}): ApplicationAuthorizationCloseAction {
  if (input.pushedScreenEntry) return { kind: "back" };
  return {
    kind: "replace",
    url: buildApplicationAuthorizationCatalogUrl({ search: input.search }),
  };
}
