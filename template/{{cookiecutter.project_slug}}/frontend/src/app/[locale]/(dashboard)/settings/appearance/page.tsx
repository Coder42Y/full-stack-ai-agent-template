"use client";

import { BrandColorPicker } from "@/components/settings/brand-color-picker";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section";
import { ThemeToggle } from "@/components/theme";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsSection title="主题" description="选择浅色、深色，或跟随系统设置。">
        <SettingsRow
          label="配色模式"
          description="影响整个工作台界面。"
          control={<ThemeToggle variant="dropdown" />}
        />
      </SettingsSection>

      <SettingsSection
        title="品牌色"
        description="选择工作区内使用的强调色，当前先按设备保存。"
      >
        <BrandColorPicker />
        <div className="border-foreground/8 bg-foreground/[0.02] mt-5 rounded-xl border p-4">
          <p className="text-foreground/65 text-xs leading-relaxed">
            选择预设会在运行时更新 CSS 变量：{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">--brand-h</code>,{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">--brand-c</code>,{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">--brand-l</code>。
            如需固定默认色，可在{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">globals.css</code>
            中调整。
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
