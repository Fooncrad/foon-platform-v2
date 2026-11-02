/** FOON Media Studio: integration capability registry only.
 * This file does not connect accounts, publish content or grant permissions.
 * Actual access must be checked against tenant, role, plan and provider OAuth scopes.
 */
export const MEDIA_STUDIO_LOCALES = ["ar", "en", "fr"] as const;
export type MediaStudioLocale = (typeof MEDIA_STUDIO_LOCALES)[number];

export const MEDIA_STUDIO_SECTIONS = [
  "accounts", "library", "designer", "calendar", "publishing", "inbox", "analytics"
] as const;
export type MediaStudioSection = (typeof MEDIA_STUDIO_SECTIONS)[number];

export const MEDIA_STUDIO_LABELS: Record<MediaStudioSection, Record<MediaStudioLocale, string>> = {
  accounts: { ar: "الحسابات المرتبطة", en: "Connected accounts", fr: "Comptes connectés" },
  library: { ar: "مكتبة الميديا", en: "Media library", fr: "Médiathèque" },
  designer: { ar: "محرر التصاميم", en: "Design editor", fr: "Éditeur de créations" },
  calendar: { ar: "تقويم المحتوى", en: "Content calendar", fr: "Calendrier éditorial" },
  publishing: { ar: "النشر والجدولة", en: "Publishing & scheduling", fr: "Publication et planification" },
  inbox: { ar: "الرسائل والتعليقات", en: "Messages & comments", fr: "Messages et commentaires" },
  analytics: { ar: "تحليلات الحملات", en: "Campaign analytics", fr: "Analyse des campagnes" }
};

/** Feature availability varies by provider approval, OAuth scopes and API tier.
 * Never infer publish or inbox access from a connected-account status.
 */
export const MEDIA_STUDIO_PROVIDERS = [
  "instagram", "facebook", "tiktok", "snapchat", "youtube", "x", "whatsapp"
] as const;
export type MediaStudioProvider = (typeof MEDIA_STUDIO_PROVIDERS)[number];

export function mediaStudioSections(locale: MediaStudioLocale) {
  return MEDIA_STUDIO_SECTIONS.map(code => ({ code, label: MEDIA_STUDIO_LABELS[code][locale] }));
}
