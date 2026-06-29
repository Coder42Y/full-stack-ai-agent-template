import type { ReactNode } from "react";

import { PageHero } from "@/components/dashboard/page-hero";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      <PageHero
        eyebrow="个人资料"
        title={
          <>
            管理你的演示身份。
          </>
        }
        description="MVP 阶段使用演示管理员账号进入系统，具体业务操作在需求工作台内切换产品/开发/测试身份。"
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
