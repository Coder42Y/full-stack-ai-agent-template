"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, MessageSquare, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui";

interface NotificationCategory {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Default values for new users. */
  defaults: { email: boolean; inApp: boolean };
}

const CATEGORIES: NotificationCategory[] = [
  {
    key: "billing",
    label: "账单",
    description: "订阅续费、支付失败、额度不足提醒。",
    icon: CreditCard,
    defaults: { email: true, inApp: true },
  },
  {
    key: "members",
    label: "团队动态",
    description: "邀请接受、成员加入或离开协作空间。",
    icon: Users,
    defaults: { email: true, inApp: true },
  },
  {
    key: "security",
    label: "安全提醒",
    description: "新设备登录、密码变更、异常活动提醒。",
    icon: MessageSquare,
    defaults: { email: true, inApp: true },
  },
  {
    key: "product",
    label: "产品更新",
    description: "新功能、版本说明和少量使用提示。",
    icon: Sparkles,
    defaults: { email: false, inApp: true },
  },
];

const STORAGE_KEY = "settings.notifications.prefs";

type Prefs = Record<string, { email: boolean; inApp: boolean }>;

function defaultPrefs(): Prefs {
  return Object.fromEntries(
    CATEGORIES.map((c) => [c.key, { email: c.defaults.email, inApp: c.defaults.inApp }]),
  );
}

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    return { ...defaultPrefs(), ...(JSON.parse(raw) as Prefs) };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(prefs: Prefs) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [dirty, setDirty] = useState(false);
  const initialPrefs = useMemo(loadPrefs, []);

  useEffect(() => {
    setPrefs(initialPrefs);
  }, [initialPrefs]);

  const toggle = (key: string, channel: "email" | "inApp") => {
    setPrefs((prev) => ({
      ...prev,
      [key]: {
        email: prev[key]?.email ?? true,
        inApp: prev[key]?.inApp ?? true,
        [channel]: !(prev[key]?.[channel] ?? true),
      },
    }));
    setDirty(true);
  };

  const handleSave = () => {
    savePrefs(prefs);
    toast.success("通知偏好已保存");
    setDirty(false);
  };

  const handleReset = () => {
    setPrefs(defaultPrefs());
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="通知偏好"
        description="选择哪些事件通过邮件提醒，哪些只在应用内提示。"
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} className="rounded-full">
              恢复默认
            </Button>
            <Button onClick={handleSave} disabled={!dirty} size="sm" className="rounded-full">
              保存变更
            </Button>
          </div>
        }
      >
        <div className="border-foreground/10 bg-background overflow-hidden rounded-2xl border">
          <div className="border-foreground/10 bg-foreground/[0.02] grid grid-cols-[1fr_70px_70px] items-center gap-2 border-b px-5 py-3 sm:grid-cols-[1.5fr_90px_90px]">
            <span className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase">
              类型
            </span>
            <span className="text-foreground/55 text-center font-mono text-[11px] tracking-wider uppercase">
              邮件
            </span>
            <span className="text-foreground/55 text-center font-mono text-[11px] tracking-wider uppercase">
              应用内
            </span>
          </div>
          <ul className="divide-foreground/10 divide-y">
            {CATEGORIES.map((c) => {
              const p = prefs[c.key] ?? c.defaults;
              const enabled = p.email || p.inApp;
              return (
                <li
                  key={c.key}
                  className="hover:bg-foreground/[0.015] grid grid-cols-[1fr_70px_70px] items-center gap-2 px-5 py-4 transition-colors sm:grid-cols-[1.5fr_90px_90px]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        enabled ? "bg-brand/15 text-foreground" : "bg-foreground/8 text-foreground/40"
                      }`}
                    >
                      <c.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-semibold">{c.label}</p>
                      <p className="text-foreground/55 mt-0.5 text-xs leading-relaxed">
                        {c.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Toggle checked={p.email} onChange={() => toggle(c.key, "email")} />
                  </div>
                  <div className="flex justify-center">
                    <Toggle checked={p.inApp} onChange={() => toggle(c.key, "inApp")} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-foreground/55 mt-4 text-xs leading-relaxed">
          当前偏好先保存在本地。后续接入{" "}
          <code className="font-mono">/users/me/notifications</code> 后可跨设备同步。
        </p>
      </SettingsSection>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
        checked ? "bg-brand" : "bg-foreground/15 hover:bg-foreground/20"
      }`}
      style={
        checked
          ? { boxShadow: "0 0 12px oklch(from var(--color-brand) l c h / 0.35)" }
          : undefined
      }
    >
      <span
        aria-hidden
        className={`bg-card inline-block h-5 w-5 transform rounded-full shadow-md transition-transform ${
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
