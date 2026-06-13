{% raw %}"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Database,
  FileText,
  GitBranch,
  MessageSquareText,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { useAuth, useKnowledgeBases } from "@/hooks";
import { ROUTES } from "@/lib/constants";
import type { KnowledgeBase } from "@/types";

const workflow = [
  {
    title: "产品一句话录入",
    description: "输入一个模糊想法，AI 先生成 Markdown 草案并追问关键澄清问题。",
    icon: Sparkles,
  },
  {
    title: "回答澄清并入库",
    description: "在问题下方直接填写回答，形成可追踪的新版本需求文档。",
    icon: FileText,
  },
  {
    title: "开发有来源查询",
    description: "开发围绕需求提问，答案必须带来源引用，不足时明确缺口。",
    icon: MessageSquareText,
  },
  {
    title: "拆解与版本变更",
    description: "按章节拆解实现/测试关注点，产品可确认变更，开发只提交建议。",
    icon: GitBranch,
  },
];

const focusItems = [
  { label: "待澄清", value: "3", note: "产品确认后生成新版本" },
  { label: "待拆解", value: "2", note: "开发可直接生成实现关注点" },
  { label: "待确认变更", value: "1", note: "产品决定是否应用草案" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { kbs, isLoading, fetchKBs } = useKnowledgeBases();

  useEffect(() => {
    fetchKBs();
  }, [fetchKBs]);

  const stats = useMemo(
    () => [
      { label: "需求项目", value: kbs.length },
      { label: "团队范围", value: kbs.filter((kb) => kb.scope === "org").length },
      { label: "MVP 身份", value: "产品/开发" },
    ],
    [kbs],
  );

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5 pb-10">
      <section className="border-foreground/10 bg-card/80 overflow-hidden rounded-md border">
        <div className="grid min-h-[260px] lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex flex-col justify-between p-6 sm:p-8">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
                需求协作指挥台
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                从想法到可执行需求，保持同一条上下文。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground/62">
                产品录入和确认，开发查询、拆解并提交建议。所有问题、回答、版本和来源都围绕需求项目组织。
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <PrimaryLink href={ROUTES.KB} label="进入需求项目" />
              <SecondaryLink href={ROUTES.CHAT} label="打开需求对话" />
            </div>
          </div>

          <div className="border-foreground/10 bg-foreground/[0.025] border-t p-5 lg:border-t-0 lg:border-l">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                今日关注
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-2.5 py-1 text-[11px] text-foreground/60">
                <CircleDot className="h-3 w-3 text-brand" />
                MVP 演示
              </span>
            </div>
            <div className="mt-4 divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
              {focusItems.map((item) => (
                <div key={item.label} className="grid grid-cols-[52px_1fr] gap-3 p-3">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {item.value}
                  </p>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-foreground/50">
                      {item.note}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-foreground/10 bg-background px-3 py-3"
                >
                  <p className="text-xl font-semibold tabular-nums text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[11px] text-foreground/45">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        {workflow.map((item) => (
          <div
            key={item.title}
            className="border-foreground/10 bg-card/80 rounded-md border p-4"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
              <item.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-foreground/58">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-foreground/10 bg-card/80">
          <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-5 py-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                最近需求项目
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">继续推进</h2>
            </div>
            <Link
              href={ROUTES.KB}
              className="text-sm font-medium text-foreground underline underline-offset-4"
            >
              查看全部
            </Link>
          </div>

          <div className="p-5">
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-md bg-foreground/[0.06]" />
              ))}
              </div>
            ) : kbs.length === 0 ? (
              <div className="rounded-md border border-dashed border-foreground/15 p-5 text-sm text-foreground/60">
                还没有需求项目。先创建一个项目，再把一句话需求或 PRD 文档放进工作台。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {kbs.slice(0, 4).map((kb) => (
                  <ProjectTile key={kb.id} kb={kb} />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-md border border-foreground/10 bg-card/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-foreground/45" />
              <h2 className="text-sm font-semibold text-foreground">当前演示身份</h2>
            </div>
            <CheckCircle2 className="h-4 w-4 text-brand" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/62">
            登录用户：{user?.email ?? "MVP 管理员"}。真实权限先不拆，需求工作台内提供
            产品/开发切换：产品可写入和确认版本，开发可查询、拆解并提交修改建议。
          </p>
          <div className="mt-4 space-y-2">
            <RoleRow label="产品" value="录入需求、回答澄清、应用新版本" />
            <RoleRow label="开发" value="查询来源、拆解任务、提交建议" />
          </div>
        </aside>
      </section>
    </div>
  );
}

function ProjectTile({ kb }: { kb: KnowledgeBase }) {
  const title = kb.project_name || kb.name;
  return (
    <Link
      href={ROUTES.KB_DETAIL(kb.id)}
      className="group rounded-md border border-foreground/10 bg-background p-4 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
          <Database className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/55">
            {kb.description || "进入工作台录入一句话需求、上传 PRD，并进行查询和版本变更。"}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-foreground/35 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function PrimaryLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function SecondaryLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-foreground/15 bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground/35"
    >
      <BookOpenCheck className="h-4 w-4" />
      {label}
    </Link>
  );
}

function RoleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background px-3 py-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">{value}</p>
    </div>
  );
}
{% endraw %}
