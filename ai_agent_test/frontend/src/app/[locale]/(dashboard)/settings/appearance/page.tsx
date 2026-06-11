"use client";

import { BrandColorPicker } from "@/components/settings/brand-color-picker";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsSection
        title="Theme"
        description="The demo uses a fixed high-contrast light interface."
      >
        <SettingsRow
          label="Color scheme"
          description="Dark mode is disabled so the dashboard and marketing pages stay visually consistent."
          control={
            <span className="border-foreground/15 bg-background inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold">
              Light
            </span>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Brand color"
        description="Pick the accent color used across the workspace. Saved per-device."
      >
        <BrandColorPicker />
        <div className="border-foreground/8 bg-foreground/[0.02] mt-5 rounded-xl border p-4">
          <p className="text-foreground/65 text-xs leading-relaxed">
            Choosing a preset updates CSS custom properties at runtime —{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">--brand-h</code>,{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">--brand-c</code>,{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">--brand-l</code>.
            Forking the template lets you bake any color in by editing one block in{" "}
            <code className="bg-foreground/8 rounded px-1 font-mono text-[11px]">globals.css</code>.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
