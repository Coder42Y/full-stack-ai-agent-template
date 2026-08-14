"use client";

import { useTranslations } from "next-intl";

import { BrandColorPicker } from "@/components/settings/brand-color-picker";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section";

export default function AppearanceSettingsPage() {
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      <SettingsSection
        title={t("appearance.theme")}
        description={t("appearance.themeDescription")}
      >
        <SettingsRow
          label={t("appearance.colorScheme")}
          description={t("appearance.colorSchemeDescription")}
          control={
            <span className="border-foreground/15 bg-background inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold">
              {t("appearance.light")}
            </span>
          }
        />
      </SettingsSection>

      <SettingsSection
        title={t("appearance.brandColor")}
        description={t("appearance.brandColorDescription")}
      >
        <BrandColorPicker />
        <div className="border-foreground/8 bg-foreground/[0.02] mt-5 rounded-xl border p-4">
          <p className="text-foreground/65 text-xs leading-relaxed">
            {t.rich("appearance.brandColorHint", {
              code: (chunks) => (
                <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">{chunks}</code>
              ),
            })}
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
