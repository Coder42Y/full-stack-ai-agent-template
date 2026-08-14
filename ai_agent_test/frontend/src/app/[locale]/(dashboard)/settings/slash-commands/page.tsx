"use client";

import { useTranslations } from "next-intl";

import { SettingsSection } from "@/components/settings/settings-section";
import { SlashCommandsManager } from "@/components/settings/slash-commands-manager";

export default function SlashCommandsSettingsPage() {
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      <SettingsSection
        title={t("slashCommands.title")}
        description={t("slashCommands.description")}
      >
        <SlashCommandsManager />
      </SettingsSection>
    </div>
  );
}
