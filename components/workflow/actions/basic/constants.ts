/** The Video node's gender pick → voices CluegaRouter marks live-verified through the relay. */
export const VOICE_BY_GENDER: Record<"male" | "female", string> = {
  male: "Puck",
  female: "Kore",
};

/** Konva wraps at the box width and browser metrics drift a few %, so text boxes get slack. */
export const SLACK_RATIO = 0.12;
export const SLACK_MIN = 8;
// Slack goes on the side the alignment grows toward, so the text stays where it was.
export const ANCHOR = { left: 0, center: 0.5, right: 1 } as const;
export const BOLD_FROM = 600;
export const NAME_MAX = 24;

/** ~2 minutes at an interactive cadence; the shared jobPollPacer still spaces the actual reads. */
export const POLL_INTERVAL_MS = 3_000;
export const POLL_BUDGET_MS = 120_000;
/** A token-expiry window costs 1–2 failing ticks before the refresh lands. */
export const MAX_ERRORS = 5;

/** A font family name safe to request from Google Fonts. */
export const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;
