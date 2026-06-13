{% raw %}"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
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
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <section className="rounded-lg border border-foreground/10 bg-card p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/55">
              需求协作首页
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              需求知识库 MVP
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65">
              从一句话需求到 AI 澄清、Markdown 入库、开发查询、需求拆解和版本变更，
              当前演示聚焦产品与开发两个身份。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryLink href={ROUTES.KB} label="进入需求项目" />
              <SecondaryLink href={ROUTES.CHAT} label="打开需求对话" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-3">
                <p className="text-xl font-semibold tabular-nums text-foreground">{stat.value}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {workflow.map((item) => (
          <div key={item.title} className="rounded-lg border border-foreground/10 bg-card p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand/15 text-foreground">
              <item.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-foreground">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/60">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-foreground/10 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                最近需求项目
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">继续推进</h2>
            </div>
            <Link href={ROUTES.KB} className="text-sm font-medium text-foreground underline underline-offset-4">
              查看全部
            </Link>
          </div>

          {isLoading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-md bg-foreground/[0.06]" />
              ))}
            </div>
          ) : kbs.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-foreground/15 p-5 text-sm text-foreground/60">
              还没有需求项目。先创建一个项目，再把一句话需求或 PRD 文档放进工作台。
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {kbs.slice(0, 4).map((kb) => (
                <ProjectTile key={kb.id} kb={kb} />
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-foreground/10 bg-card p-5">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-foreground/45" />
            <h2 className="text-sm font-semibold text-foreground">当前演示身份</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/65">
            登录用户：{user?.email ?? "MVP Admin"}。真实权限先不拆，需求工作台内提供
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
      className="group rounded-md border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-foreground">
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
      className="inline-flex h-10 items-center gap-2 rounded-md border border-foreground/15 px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground/35"
    >
      <BookOpenCheck className="h-4 w-4" />
      {label}
    </Link>
  );
}

function RoleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">{value}</p>
    </div>
  );
}
{% endraw %}
