{% raw %}import Link from "next/link";
import { CheckCircle2, CircleDot, FileText, GitBranch, MessageSquareText } from "lucide-react";

import { APP_NAME, ROUTES } from "@/lib/constants";

const HIGHLIGHTS = [
  { label: "录入", value: "一句话需求与 PRD 入库", icon: FileText },
  { label: "澄清", value: "AI 追问并沉淀回答", icon: MessageSquareText },
  { label: "变更", value: "拆解、建议和版本确认", icon: GitBranch },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_460px]">
      <main id="main" className="theme-light flex min-h-screen flex-col bg-background">
        <header className="flex h-14 items-center justify-between border-b border-foreground/10 px-4 sm:px-8">
          <Link
            href={ROUTES.HOME}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-foreground/10 bg-foreground/[0.04] text-xs font-semibold">
              KB
            </span>
            {APP_NAME}
          </Link>
          <Link
            href={ROUTES.DASHBOARD}
            className="hidden text-sm font-medium text-foreground/55 underline-offset-4 hover:text-foreground hover:underline sm:inline-flex"
          >
            返回工作台
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[430px] rounded-md border border-foreground/10 bg-card/80 p-5 shadow-sm sm:p-6">
            {children}
          </div>
        </div>

        <footer className="border-t border-foreground/10 px-4 py-4 text-xs text-foreground/45 sm:px-8">
          © {new Date().getFullYear()} {APP_NAME}
        </footer>
      </main>

      <aside className="hidden border-l border-foreground/10 bg-foreground/[0.025] p-6 lg:flex">
        <div className="flex w-full flex-col justify-between">
          <div className="space-y-6">
            <div className="rounded-md border border-foreground/10 bg-background p-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/45">
                  需求知识库 MVP
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-foreground/10 px-2 py-1 text-[11px] text-foreground/55">
                  <CircleDot className="h-3 w-3 text-brand" />
                  身份选择
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-semibold leading-tight tracking-tight text-foreground">
                登录后进入需求协作工作台。
              </h2>
              <p className="mt-3 text-sm leading-7 text-foreground/60">
                产品录入和确认，开发查询、拆解并提交建议。所有问题、回答、版本和来源都围绕需求项目组织。
              </p>
            </div>

            <div className="overflow-hidden rounded-md border border-foreground/10 bg-background">
              <div className="border-b border-foreground/10 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">核心流程</p>
              </div>
              <ul className="divide-y divide-foreground/10">
                {HIGHLIGHTS.map((item) => (
                  <li key={item.label} className="grid grid-cols-[34px_1fr] gap-3 px-4 py-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
                        {item.value}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-md border border-foreground/10 bg-background p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand" />
              <div>
                <p className="text-sm font-medium text-foreground">MVP 阶段</p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/55">
                  开放注册默认 PM 身份；登录时需选择和账号匹配的 Admin、Developer、Test 或 PM。
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
{% endraw %}
