{% raw %}import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5 pb-10">
      <header className="rounded-md border border-foreground/10 bg-card/80 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
              管理后台
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              需求协作管理视图
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/60">
              查看演示管理员身份下的用户、需求对话、回答评分和系统健康状态。
            </p>
          </div>
          <span className="inline-flex h-8 items-center gap-2 rounded-md border border-foreground/15 bg-background px-3 text-xs font-medium text-foreground/65">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" />
            MVP 管理员
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-md border border-foreground/10 bg-card/80 p-2 lg:sticky lg:top-5 lg:self-start">
          <AdminNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
{% endraw %}
