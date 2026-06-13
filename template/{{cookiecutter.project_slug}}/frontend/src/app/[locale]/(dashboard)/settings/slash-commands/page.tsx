"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { SlashCommandsManager } from "@/components/settings/slash-commands-manager";

export default function SlashCommandsSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsSection
        title="快捷指令"
        description="定制需求对话里的 / 指令：可以关闭内置指令，也可以保存常用需求提示词。"
      >
        <SlashCommandsManager />
      </SettingsSection>
    </div>
  );
}
