import type { LanguageCode } from "@/i18n/config";

type FooterMessages = Readonly<{
  copyright: string;
  terms: string;
  privacy: string;
  contact: string;
}>;

export const HELP_FOOTER_MESSAGES: Record<LanguageCode, FooterMessages> = {
  en: {
    copyright: "© {year} Cluega. All rights reserved.",
    terms: "Terms",
    privacy: "Privacy",
    contact: "Contact",
  },
  vn: {
    copyright: "© {year} Cluega. Bảo lưu mọi quyền.",
    terms: "Điều khoản",
    privacy: "Quyền riêng tư",
    contact: "Liên hệ",
  },
  zh: {
    copyright: "© {year} Cluega. 保留所有权利。",
    terms: "服务条款",
    privacy: "隐私政策",
    contact: "联系我们",
  },
  th: {
    copyright: "© {year} Cluega. สงวนลิขสิทธิ์",
    terms: "ข้อกำหนด",
    privacy: "ความเป็นส่วนตัว",
    contact: "ติดต่อเรา",
  },
};
