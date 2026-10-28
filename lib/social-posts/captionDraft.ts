import type { LanguageCode } from "@/i18n/config";
import type { SocialPlatform, SocialPostDraft } from "@/lib/social-posts/client";

// Deterministic caption drafting for the social-post composer (PRD chapter V).
// V1 has no backend suggest endpoint yet — this module builds a readable
// first draft from the source turn's prompt and cycles template variants for
// the per-field "regenerate" button. Isolated so an AI endpoint can replace
// `draftCaption` without touching the flow components.
//
// The copy itself lives in the locale catalogs
// (`appChat.socialPost.captionTemplates.<platform>.v1..v3`), not here: a caption
// is content the user publishes, so drafting it in English for a Vietnamese
// creative was simply wrong. The translator is INJECTED rather than imported so
// this module stays free of the React i18n provider — a test can drive it with
// the shipped catalog, and it cannot drag a client-only module into lib/.

const TEMPLATE_VARIANTS = ["v1", "v2", "v3"] as const;

/** Words too generic to hashtag. Per language, because filtering a Vietnamese
 *  prompt through an English stopword list yields #của / #cho / #một. */
const STOPWORDS: Record<LanguageCode, readonly string[]> = {
  en: [
    "a", "an", "the", "and", "or", "for", "with", "of", "in", "on", "to",
    "my", "our", "your", "this", "that", "make", "create", "generate",
    "video", "image", "photo", "ad", "ads",
  ],
  vn: [
    "và", "hoặc", "cho", "với", "của", "trong", "trên", "một", "các", "những",
    "này", "đó", "là", "có", "tôi", "bạn", "chúng", "hãy", "làm", "tạo",
    "video", "ảnh", "hình", "quảng", "cáo", "giây",
  ],
  zh: [
    "的", "了", "和", "與", "或", "在", "為", "給", "我", "你", "我們", "這",
    "那", "個", "請", "做", "生成", "製作", "影片", "視頻", "圖片", "照片",
    "廣告", "秒",
  ],
  th: [
    "และ", "หรือ", "สำหรับ", "กับ", "ของ", "ที่", "นี้", "นั้น", "เป็น", "ฉัน",
    "คุณ", "เรา", "ช่วย", "สร้าง", "วิดีโอ", "รูป", "ภาพ", "โฆษณา", "วินาที",
  ],
};

// Hashtags are platform-native tokens (people search "#fyp", not a translation),
// so they stay literal in every locale.
const PLATFORM_TAGS: Record<SocialPlatform, string[]> = {
  tiktok: ["fyp", "tiktokmademebuyit"],
  instagram: ["reels", "instagood"],
  facebook: [],
};

/** How a caption reaches its copy: the caller's `t` plus the language whose
 *  stopword list applies (both come from `useTranslate`). */
export type CaptionLocale = {
  t: (key: string) => string;
  lang: LanguageCode;
};

/** Keywords worth hashtagging, pulled from the free-text prompt. */
export function hashtagsFromPrompt(
  prompt: string,
  max = 5,
  lang: LanguageCode = "en",
): string[] {
  // Every language's list, not just the active one: a Vietnamese UI regularly
  // gets an English prompt, and dropping "the" is right either way.
  const stop = new Set<string>([
    ...STOPWORDS[lang],
    ...STOPWORDS.en,
  ]);
  const words = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stop.has(word));
  const unique: string[] = [];
  for (const word of words) {
    if (!unique.includes(word)) unique.push(word);
    if (unique.length >= max) break;
  }
  return unique;
}

/** A short human subject from the prompt (first ~8 informative words). */
function subjectFromPrompt(prompt: string, locale: CaptionLocale): string {
  const words = prompt.trim().split(/\s+/).slice(0, 8);
  const cleaned = words.join(" ").replace(/[.!?]+$/, "");
  if (cleaned) return cleaned;
  return locale.t("appChat.socialPost.subjectFallback");
}

/**
 * Draft one platform's caption + hashtags in `lang`. `variant` cycles the
 * templates — pass an incrementing counter from the regenerate button.
 */
export function draftCaption(
  platform: SocialPlatform,
  sourcePrompt: string,
  variant: number,
  locale: CaptionLocale,
): SocialPostDraft {
  const name = TEMPLATE_VARIANTS[Math.abs(variant) % TEMPLATE_VARIANTS.length];
  const template = locale.t(
    `appChat.socialPost.captionTemplates.${platform}.${name}`,
  );
  const subject = subjectFromPrompt(sourcePrompt, locale);
  return {
    // A missing key returns the key itself, which would publish
    // "appChat.socialPost…" as someone's caption — fall back to the subject.
    caption: template.includes("{subject}")
      ? template.replaceAll("{subject}", subject)
      : subject,
    hashtags: [
      ...hashtagsFromPrompt(sourcePrompt, 5, locale.lang),
      ...PLATFORM_TAGS[platform],
    ].slice(0, 6),
  };
}
