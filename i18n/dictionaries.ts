/**
 * The bundled locale catalogs and the non-React reader over them.
 *
 * Kept out of `useTranslate.tsx` on purpose: this is data, not a hook, and its
 * non-React callers (fetch helpers, SSE drivers) are reachable from
 * `node --test`, whose resolver only tries `x.ts` and `x/index.ts` — it cannot
 * load a `.tsx` file, and Node cannot parse JSX anyway.
 */

import { DEFAULT_LANGUAGE, type LanguageCode } from "@/i18n/config";
import { currentLanguage } from "@/i18n/language-state";
import enCommon from "@/i18n/locales/en/common.json";
import enCallIntelligence from "@/i18n/locales/en/callIntelligence.json";
import enHome from "@/i18n/locales/en/home.json";
import enLogin from "@/i18n/locales/en/login.json";
import enPlatform from "@/i18n/locales/en/platform.json";
import enPlatformData from "@/i18n/locales/en/platformData.json";
import enPlatformCollab from "@/i18n/locales/en/platformCollab.json";
import enPlatformResources from "@/i18n/locales/en/platformResources.json";
import enPlatformVisualDesign from "@/i18n/locales/en/platformVisualDesign.json";
import enPricingAi from "@/i18n/locales/en/pricingAi.json";
import enPlatformCommerceOps from "@/i18n/locales/en/platformCommerceOps.json";
import enPlatformEnterprise from "@/i18n/locales/en/platformEnterprise.json";
import enCareers from "@/i18n/locales/en/careers.json";
import enReporting from "@/i18n/locales/en/reporting.json";
import enMarketing from "@/i18n/locales/en/marketing.json";
import enSettings from "@/i18n/locales/en/settings.json";
import vnCommon from "@/i18n/locales/vn/common.json";
import vnCallIntelligence from "@/i18n/locales/vn/callIntelligence.json";
import vnHome from "@/i18n/locales/vn/home.json";
import vnLogin from "@/i18n/locales/vn/login.json";
import vnPlatform from "@/i18n/locales/vn/platform.json";
import vnPlatformData from "@/i18n/locales/vn/platformData.json";
import vnPlatformCollab from "@/i18n/locales/vn/platformCollab.json";
import vnPlatformResources from "@/i18n/locales/vn/platformResources.json";
import vnPlatformVisualDesign from "@/i18n/locales/vn/platformVisualDesign.json";
import vnPricingAi from "@/i18n/locales/vn/pricingAi.json";
import vnPlatformCommerceOps from "@/i18n/locales/vn/platformCommerceOps.json";
import vnPlatformEnterprise from "@/i18n/locales/vn/platformEnterprise.json";
import vnCareers from "@/i18n/locales/vn/careers.json";
import vnReporting from "@/i18n/locales/vn/reporting.json";
import vnMarketing from "@/i18n/locales/vn/marketing.json";
import vnSettings from "@/i18n/locales/vn/settings.json";
import zhCommon from "@/i18n/locales/zh/common.json";
import zhCallIntelligence from "@/i18n/locales/zh/callIntelligence.json";
import zhHome from "@/i18n/locales/zh/home.json";
import zhLogin from "@/i18n/locales/zh/login.json";
import zhPlatform from "@/i18n/locales/zh/platform.json";
import zhPlatformData from "@/i18n/locales/zh/platformData.json";
import zhPlatformCollab from "@/i18n/locales/zh/platformCollab.json";
import zhPlatformResources from "@/i18n/locales/zh/platformResources.json";
import zhPlatformVisualDesign from "@/i18n/locales/zh/platformVisualDesign.json";
import zhPricingAi from "@/i18n/locales/zh/pricingAi.json";
import zhPlatformCommerceOps from "@/i18n/locales/zh/platformCommerceOps.json";
import zhPlatformEnterprise from "@/i18n/locales/zh/platformEnterprise.json";
import zhCareers from "@/i18n/locales/zh/careers.json";
import zhReporting from "@/i18n/locales/zh/reporting.json";
import zhMarketing from "@/i18n/locales/zh/marketing.json";
import zhSettings from "@/i18n/locales/zh/settings.json";
import thCommon from "@/i18n/locales/th/common.json";
import thCallIntelligence from "@/i18n/locales/th/callIntelligence.json";
import thHome from "@/i18n/locales/th/home.json";
import thLogin from "@/i18n/locales/th/login.json";
import thPlatform from "@/i18n/locales/th/platform.json";
import thPlatformData from "@/i18n/locales/th/platformData.json";
import thPlatformCollab from "@/i18n/locales/th/platformCollab.json";
import thPlatformResources from "@/i18n/locales/th/platformResources.json";
import thPlatformVisualDesign from "@/i18n/locales/th/platformVisualDesign.json";
import thPricingAi from "@/i18n/locales/th/pricingAi.json";
import thPlatformCommerceOps from "@/i18n/locales/th/platformCommerceOps.json";
import thPlatformEnterprise from "@/i18n/locales/th/platformEnterprise.json";
import thCareers from "@/i18n/locales/th/careers.json";
import thReporting from "@/i18n/locales/th/reporting.json";
import thMarketing from "@/i18n/locales/th/marketing.json";
import thSettings from "@/i18n/locales/th/settings.json";
import enSuggestionPills from "@/i18n/locales/en/suggestionPills.json";
import vnSuggestionPills from "@/i18n/locales/vn/suggestionPills.json";
import zhSuggestionPills from "@/i18n/locales/zh/suggestionPills.json";
import thSuggestionPills from "@/i18n/locales/th/suggestionPills.json";
import enChatTips from "@/i18n/locales/en/chatTips.json";
import vnChatTips from "@/i18n/locales/vn/chatTips.json";
import zhChatTips from "@/i18n/locales/zh/chatTips.json";
import thChatTips from "@/i18n/locales/th/chatTips.json";
import vnAppChat from "@/i18n/locales/vn/appChat.json";
import zhAppChat from "@/i18n/locales/zh/appChat.json";
import thAppChat from "@/i18n/locales/th/appChat.json";
import enAppChat from "@/i18n/locales/en/appChat.json";
import vnDashboard from "@/i18n/locales/vn/dashboard.json";
import zhDashboard from "@/i18n/locales/zh/dashboard.json";
import thDashboard from "@/i18n/locales/th/dashboard.json";
import enDashboard from "@/i18n/locales/en/dashboard.json";
import enAppSettings from "@/i18n/locales/en/appSettings.json";
import enAccountReport from "@/i18n/locales/en/accountReport.json";
import vnAppSettings from "@/i18n/locales/vn/appSettings.json";
import vnAccountReport from "@/i18n/locales/vn/accountReport.json";
import zhAppSettings from "@/i18n/locales/zh/appSettings.json";
import zhAccountReport from "@/i18n/locales/zh/accountReport.json";
import thAppSettings from "@/i18n/locales/th/appSettings.json";
import thAccountReport from "@/i18n/locales/th/accountReport.json";
import enUsageAnalytics from "@/i18n/locales/en/usageAnalytics.json";
import vnUsageAnalytics from "@/i18n/locales/vn/usageAnalytics.json";
import zhUsageAnalytics from "@/i18n/locales/zh/usageAnalytics.json";
import thUsageAnalytics from "@/i18n/locales/th/usageAnalytics.json";
import enPulse from "@/i18n/locales/en/pulse.json";
import vnPulse from "@/i18n/locales/vn/pulse.json";
import zhPulse from "@/i18n/locales/zh/pulse.json";
import thPulse from "@/i18n/locales/th/pulse.json";
import enUi from "@/i18n/locales/en/ui.json";
import vnUi from "@/i18n/locales/vn/ui.json";
import zhUi from "@/i18n/locales/zh/ui.json";
import thUi from "@/i18n/locales/th/ui.json";
import enEvents from "@/i18n/locales/en/events.json";
import vnEvents from "@/i18n/locales/vn/events.json";
import zhEvents from "@/i18n/locales/zh/events.json";
import thEvents from "@/i18n/locales/th/events.json";
import enOnboarding from "@/i18n/locales/en/onboarding.json";
import vnOnboarding from "@/i18n/locales/vn/onboarding.json";
import zhOnboarding from "@/i18n/locales/zh/onboarding.json";
import thOnboarding from "@/i18n/locales/th/onboarding.json";
import enUserOnboarding from "@/i18n/locales/en/user-onboarding.json";
import vnUserOnboarding from "@/i18n/locales/vn/user-onboarding.json";
import zhUserOnboarding from "@/i18n/locales/zh/user-onboarding.json";
import thUserOnboarding from "@/i18n/locales/th/user-onboarding.json";
import enLearn from "@/i18n/locales/en/learn.json";
import vnLearn from "@/i18n/locales/vn/learn.json";
import zhLearn from "@/i18n/locales/zh/learn.json";
import thLearn from "@/i18n/locales/th/learn.json";
import enPolicy from "@/i18n/locales/en/policy.json";
import vnPolicy from "@/i18n/locales/vn/policy.json";
import zhPolicy from "@/i18n/locales/zh/policy.json";
import thPolicy from "@/i18n/locales/th/policy.json";
import enMarketInsights from "@/i18n/locales/en/marketInsights.json";
import vnMarketInsights from "@/i18n/locales/vn/marketInsights.json";
import zhMarketInsights from "@/i18n/locales/zh/marketInsights.json";
import thMarketInsights from "@/i18n/locales/th/marketInsights.json";
import enAbout from "@/i18n/locales/en/about.json";
import vnAbout from "@/i18n/locales/vn/about.json";
import zhAbout from "@/i18n/locales/zh/about.json";
import thAbout from "@/i18n/locales/th/about.json";
import enPartnerProgram from "@/i18n/locales/en/partnerProgram.json";
import vnPartnerProgram from "@/i18n/locales/vn/partnerProgram.json";
import zhPartnerProgram from "@/i18n/locales/zh/partnerProgram.json";
import thPartnerProgram from "@/i18n/locales/th/partnerProgram.json";
import enComparePancake from "@/i18n/locales/en/comparePancake.json";
import vnComparePancake from "@/i18n/locales/vn/comparePancake.json";
import zhComparePancake from "@/i18n/locales/zh/comparePancake.json";
import thComparePancake from "@/i18n/locales/th/comparePancake.json";
import enCompareZwiz from "@/i18n/locales/en/compareZwiz.json";
import vnCompareZwiz from "@/i18n/locales/vn/compareZwiz.json";
import zhCompareZwiz from "@/i18n/locales/zh/compareZwiz.json";
import thCompareZwiz from "@/i18n/locales/th/compareZwiz.json";
import enCompareSmartly from "@/i18n/locales/en/compareSmartly.json";
import vnCompareSmartly from "@/i18n/locales/vn/compareSmartly.json";
import zhCompareSmartly from "@/i18n/locales/zh/compareSmartly.json";
import thCompareSmartly from "@/i18n/locales/th/compareSmartly.json";
import enCompareMadgicx from "@/i18n/locales/en/compareMadgicx.json";
import vnCompareMadgicx from "@/i18n/locales/vn/compareMadgicx.json";
import zhCompareMadgicx from "@/i18n/locales/zh/compareMadgicx.json";
import thCompareMadgicx from "@/i18n/locales/th/compareMadgicx.json";
import enCompareStoreclaw from "@/i18n/locales/en/compareStoreclaw.json";
import vnCompareStoreclaw from "@/i18n/locales/vn/compareStoreclaw.json";
import zhCompareStoreclaw from "@/i18n/locales/zh/compareStoreclaw.json";
import thCompareStoreclaw from "@/i18n/locales/th/compareStoreclaw.json";
import enCompareRyze from "@/i18n/locales/en/compareRyze.json";
import vnCompareRyze from "@/i18n/locales/vn/compareRyze.json";
import zhCompareRyze from "@/i18n/locales/zh/compareRyze.json";
import thCompareRyze from "@/i18n/locales/th/compareRyze.json";
import enTiktokCampaignBuilder from "@/i18n/locales/en/tiktokCampaignBuilder.json";
import vnTiktokCampaignBuilder from "@/i18n/locales/vn/tiktokCampaignBuilder.json";
import zhTiktokCampaignBuilder from "@/i18n/locales/zh/tiktokCampaignBuilder.json";
import thTiktokCampaignBuilder from "@/i18n/locales/th/tiktokCampaignBuilder.json";
import enSolutionsAgency from "@/i18n/locales/en/solutionsAgency.json";
import vnSolutionsAgency from "@/i18n/locales/vn/solutionsAgency.json";
import zhSolutionsAgency from "@/i18n/locales/zh/solutionsAgency.json";
import thSolutionsAgency from "@/i18n/locales/th/solutionsAgency.json";
import enSolutionsBrand from "@/i18n/locales/en/solutionsBrand.json";
import vnSolutionsBrand from "@/i18n/locales/vn/solutionsBrand.json";
import zhSolutionsBrand from "@/i18n/locales/zh/solutionsBrand.json";
import thSolutionsBrand from "@/i18n/locales/th/solutionsBrand.json";
import enSolutionsCreatives from "@/i18n/locales/en/solutionsCreatives.json";
import vnSolutionsCreatives from "@/i18n/locales/vn/solutionsCreatives.json";
import zhSolutionsCreatives from "@/i18n/locales/zh/solutionsCreatives.json";
import thSolutionsCreatives from "@/i18n/locales/th/solutionsCreatives.json";
import enEngineeringBlog from "@/i18n/locales/en/engineeringBlog.json";
import vnEngineeringBlog from "@/i18n/locales/vn/engineeringBlog.json";
import zhEngineeringBlog from "@/i18n/locales/zh/engineeringBlog.json";
import thEngineeringBlog from "@/i18n/locales/th/engineeringBlog.json";
import enLegal from "@/i18n/locales/en/legal.json";
import vnLegal from "@/i18n/locales/vn/legal.json";
import zhLegal from "@/i18n/locales/zh/legal.json";
import thLegal from "@/i18n/locales/th/legal.json";
import enPages from "@/i18n/locales/en/pages.json";
import vnPages from "@/i18n/locales/vn/pages.json";
import zhPages from "@/i18n/locales/zh/pages.json";
import thPages from "@/i18n/locales/th/pages.json";

const zh = {
  ...zhCommon,
  ...zhHome,
  ...zhPlatform,
  ...zhPlatformData,
  ...zhPlatformCollab,
  ...zhPlatformResources,
  ...zhPlatformVisualDesign,
  ...zhPricingAi,
  ...zhPlatformCommerceOps,
  ...zhPlatformEnterprise,
  ...zhCareers,
  ...zhCallIntelligence,
  ...zhReporting,
  ...zhMarketing,
  ...zhLogin,
  settings: zhSettings,
  appChat: zhAppChat,
  dashboard: zhDashboard,
  appSettings: zhAppSettings,
  accountReport: zhAccountReport,
  usageAnalytics: zhUsageAnalytics,
  pages: zhPages,
  ...zhPulse,
  suggestionPills: zhSuggestionPills,
  chatTips: zhChatTips,
  events: zhEvents,
  onboarding: zhOnboarding,
  userOnboarding: zhUserOnboarding,
  learn: zhLearn,
  policy: zhPolicy,
  ...zhUi,
  ...zhMarketInsights,
  ...zhAbout,
  ...zhPartnerProgram,
  ...zhComparePancake,
  ...zhCompareZwiz,
  ...zhCompareSmartly,
  ...zhCompareMadgicx,
  ...zhCompareStoreclaw,
  ...zhCompareRyze,
  ...zhTiktokCampaignBuilder,
  ...zhSolutionsAgency,
  ...zhSolutionsBrand,
  ...zhSolutionsCreatives,
  ...zhEngineeringBlog,
  ...zhLegal,
};
const vn = {
  ...vnCommon,
  ...vnHome,
  ...vnPlatform,
  ...vnPlatformData,
  ...vnPlatformCollab,
  ...vnPlatformResources,
  ...vnPlatformVisualDesign,
  ...vnPricingAi,
  ...vnPlatformCommerceOps,
  ...vnPlatformEnterprise,
  ...vnCareers,
  ...vnCallIntelligence,
  ...vnReporting,
  ...vnMarketing,
  ...vnLogin,
  settings: vnSettings,
  appChat: vnAppChat,
  dashboard: vnDashboard,
  appSettings: vnAppSettings,
  accountReport: vnAccountReport,
  usageAnalytics: vnUsageAnalytics,
  pages: vnPages,
  ...vnPulse,
  suggestionPills: vnSuggestionPills,
  chatTips: vnChatTips,
  events: vnEvents,
  onboarding: vnOnboarding,
  userOnboarding: vnUserOnboarding,
  learn: vnLearn,
  policy: vnPolicy,
  ...vnUi,
  ...vnMarketInsights,
  ...vnAbout,
  ...vnPartnerProgram,
  ...vnComparePancake,
  ...vnCompareZwiz,
  ...vnCompareSmartly,
  ...vnCompareMadgicx,
  ...vnCompareStoreclaw,
  ...vnCompareRyze,
  ...vnTiktokCampaignBuilder,
  ...vnSolutionsAgency,
  ...vnSolutionsBrand,
  ...vnSolutionsCreatives,
  ...vnEngineeringBlog,
  ...vnLegal,
};
const th = {
  ...thCommon,
  ...thHome,
  ...thPlatform,
  ...thPlatformData,
  ...thPlatformCollab,
  ...thPlatformResources,
  ...thPlatformVisualDesign,
  ...thPricingAi,
  ...thPlatformCommerceOps,
  ...thPlatformEnterprise,
  ...thCareers,
  ...thCallIntelligence,
  ...thReporting,
  ...thMarketing,
  ...thLogin,
  settings: thSettings,
  appChat: thAppChat,
  dashboard: thDashboard,
  appSettings: thAppSettings,
  accountReport: thAccountReport,
  usageAnalytics: thUsageAnalytics,
  pages: thPages,
  ...thPulse,
  suggestionPills: thSuggestionPills,
  chatTips: thChatTips,
  events: thEvents,
  onboarding: thOnboarding,
  userOnboarding: thUserOnboarding,
  learn: thLearn,
  policy: thPolicy,
  ...thUi,
  ...thMarketInsights,
  ...thAbout,
  ...thPartnerProgram,
  ...thComparePancake,
  ...thCompareZwiz,
  ...thCompareSmartly,
  ...thCompareMadgicx,
  ...thCompareStoreclaw,
  ...thCompareRyze,
  ...thTiktokCampaignBuilder,
  ...thSolutionsAgency,
  ...thSolutionsBrand,
  ...thSolutionsCreatives,
  ...thEngineeringBlog,
  ...thLegal,
};
const en = {
  ...enCommon,
  ...enHome,
  ...enPlatform,
  ...enPlatformData,
  ...enPlatformCollab,
  ...enPlatformResources,
  ...enPlatformVisualDesign,
  ...enPricingAi,
  ...enPlatformCommerceOps,
  ...enPlatformEnterprise,
  ...enCareers,
  ...enCallIntelligence,
  ...enReporting,
  ...enMarketing,
  ...enLogin,
  settings: enSettings,
  appChat: enAppChat,
  dashboard: enDashboard,
  appSettings: enAppSettings,
  accountReport: enAccountReport,
  usageAnalytics: enUsageAnalytics,
  pages: enPages,
  ...enPulse,
  suggestionPills: enSuggestionPills,
  chatTips: enChatTips,
  events: enEvents,
  onboarding: enOnboarding,
  userOnboarding: enUserOnboarding,
  learn: enLearn,
  policy: enPolicy,
  ...enUi,
  ...enMarketInsights,
  ...enAbout,
  ...enPartnerProgram,
  ...enComparePancake,
  ...enCompareZwiz,
  ...enCompareSmartly,
  ...enCompareMadgicx,
  ...enCompareStoreclaw,
  ...enCompareRyze,
  ...enTiktokCampaignBuilder,
  ...enSolutionsAgency,
  ...enSolutionsBrand,
  ...enSolutionsCreatives,
  ...enEngineeringBlog,
  ...enLegal,
};
export type Dictionary = typeof zh;
export const dictionaries: Record<LanguageCode, Dictionary> = {
  zh,
  vn,
  en,
  th,
};

export function getPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

export function translateStatic(path: string, lang?: LanguageCode): string {
  const code = lang ?? currentLanguage();
  const dictionary = dictionaries[code] ?? dictionaries[DEFAULT_LANGUAGE];
  const valueAtPath = getPathValue(dictionary, path);

  return typeof valueAtPath === "string" ? valueAtPath : path;
}
