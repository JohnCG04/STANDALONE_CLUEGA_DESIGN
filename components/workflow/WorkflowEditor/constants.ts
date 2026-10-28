import type {
  AssetSource,
  AssetType,
  WorkflowLocale,
  WorkflowTemplateCategory,
  WorkflowTemplateIndustry,
} from "@dogclaw-ad/workflow";
import { Eye, Lock } from "lucide-react";

import type { LanguageCode } from "@/i18n/config";
import type { FlowVisibility } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

/** Where to send the user when the id is missing or doesn't resolve. */
export const FLOW_LIST_ROUTE = "/flow";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const APPLY_BRAND_KIT = "apply_brand_kit";

export const HIDE_BUILDER_3D = process.env.NODE_ENV === "production";

/** Holds the canvas nodes and edges; no learn anchor lives inside it. */
export const CANVAS_VIEWPORT = ".react-flow__viewport";

/** Minimum glow time, so a fast apply reads as an event rather than an unseen flash. */
export const APPLY_GLOW_MIN_MS = 1200;

/** ~1s at 60fps: enough for a slow mount, short enough that a lost proposal gives up. */
export const RUN_WAIT_FRAMES = 60;

/** Session key of a project with no pages: its one canvas is the legacy document. */
export const DOCUMENT_SESSION = "document";

/** How long a run waits for a page to load and mount before it gives that page up. */
export const SESSION_READY_TIMEOUT_MS = 30_000;

/** Poll step while a run waits on a page to mount or load. */
export const SESSION_POLL_MS = 50;

/** A hidden page unmounts after its run only once its results are saved; it retries this often. */
export const RUN_SAVE_ATTEMPTS = 5;
export const RUN_SAVE_RETRY_MS = 3_000;

/** App language → editor locale; the package would read the app's `vn` region tag as en. */
export const EDITOR_LOCALE_BY_LANGUAGE: Record<LanguageCode, WorkflowLocale> = {
  en: "en",
  vn: "vi",
  zh: "zh",
  // The editor package ships no Thai catalogue; show it in English.
  th: "en",
};

/** Mime prefix per panel type filter — the API's `format` predicate. */
export const FORMAT_BY_TYPE: Partial<Record<AssetType, string>> = {
  image: "image/",
  video: "video/",
  audio: "audio/",
};

/** "All" is added by the panel itself. */
export const FILTER_TYPES: AssetType[] = ["image", "video", "audio", "document"];

export const DEFAULT_TAB: AssetSource = "creation";
export const SEARCH_DEBOUNCE_MS = 300;

/** The panel has no retry button, so a network blip has to recover on its own. */
export const RETRY_DELAYS_MS = [3_000, 9_000, 27_000];

/** Rows per page; the panel pages onward through `cursor` as the grid scrolls. */
export const PANEL_PAGE_SIZE = 100;

/** Page size of the "Open Project" submenu (first page and each load-more). */
export const RECENT_PROJECTS_LIMIT = 8;

/** Fallback name for a page the backend returned without one. */
export const UNTITLED_PAGE = "Untitled";

/** Category picker rows until the live taxonomy loads, and kept if it fails or comes back empty. */
export const FALLBACK_TEMPLATE_CATEGORIES: WorkflowTemplateCategory[] = [
  { id: "campaigns", name: "Campaigns" },
  { id: "cinematic", name: "Cinematic" },
  { id: "advertising", name: "Advertising" },
  { id: "fashion", name: "Fashion" },
  { id: "branding", name: "Branding" },
  { id: "editing", name: "Editing" },
  { id: "ecommerce", name: "E-commerce" },
];

/** Module scope, so the prop identity is stable until real rows replace it. */
export const EMPTY_INDUSTRIES: WorkflowTemplateIndustry[] = [];

export const DOWNLOAD_SELECTOR = ".cwf-media-detail__download";
export const DETAIL_SELECTOR = ".cwf-media-detail";

/** Wire value and icon only; copy comes from `appChat.flow.share.visibility.<value>`. */
export const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: FlowVisibility;
  Icon: typeof Lock;
}> = [
  { value: "restricted", Icon: Lock },
  { value: "public", Icon: Eye },
];
