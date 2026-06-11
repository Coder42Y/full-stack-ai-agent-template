import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "use-intl";

// Supported locales
export const locales = ["zh", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh";

type MessageValue = string | MessageValue[] | { [key: string]: MessageValue };
type Messages = Record<string, MessageValue>;

function mergeMessages(base: Messages, override: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      merged[key] = mergeMessages(baseValue as Messages, value as Messages);
    } else {
      merged[key] = value;
    }
  }
  return merged as Messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  const englishMessages = (await import("../messages/en.json")).default as Messages;
  const localeMessages =
    locale === "en"
      ? englishMessages
      : mergeMessages(
          englishMessages,
          (await import(`../messages/${locale}.json`)).default as Messages,
        );

  return {
    locale,
    messages: localeMessages as unknown as AbstractIntlMessages,
  };
});

export function getLocaleLabel(locale: Locale): string {
  const labels: Record<Locale, string> = {
    zh: "中文",
    en: "English",
  };
  return labels[locale];
}

export function getLocaleFlag(locale: Locale): string {
  const flags: Record<Locale, string> = {
    zh: "🇨🇳",
    en: "🇺🇸",
  };
  return flags[locale];
}
