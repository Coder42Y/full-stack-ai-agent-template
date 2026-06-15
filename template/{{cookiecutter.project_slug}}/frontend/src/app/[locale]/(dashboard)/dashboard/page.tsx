{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
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
  {
    label: "待澄清",
    value: "3",
    note: "产品确认后生成新版本",
    focus: "clarify",
    action: "处理澄清",
  },
  {
    label: "待拆解",
    value: "2",
    note: "开发可直接生成实现关注点",
    focus: "breakdown",
    action: "进入拆解",
  },
  {
    label: "待确认变更",
    value: "1",
    note: "产品决定是否应用草案",
    focus: "change",
    action: "确认变更",
  },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { kbs, isLoading, fetchKBs } = useKnowledgeBases();
  const firstProjectId = kbs[0]?.id;

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
                <Link
                  key={item.label}
                  href={
                    firstProjectId
                      ? `${ROUTES.KB_DETAIL(firstProjectId)}?focus=${item.focus}`
                      : ROUTES.KB
                  }
                  className="group grid grid-cols-[52px_1fr_auto] items-center gap-3 p-3 transition-colors hover:bg-foreground/[0.04]"
                >
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {item.value}
                  </p>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-foreground/50">
                      {item.note}
                    </p>
                  </div>
                  <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-foreground/10 px-2.5 text-[11px] font-medium text-foreground/65 transition-colors group-hover:border-foreground/25 group-hover:text-foreground">
                    {firstProjectId ? item.action : "新建项目"}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-foreground/10 bg-background px-3 py-3"
                >
                  <p
                    className={
                      typeof stat.value === "string"
                        ? "whitespace-nowrap text-lg font-semibold tabular-nums text-foreground"
                        : "text-xl font-semibold tabular-nums text-foreground"
                    }
                  >
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
            <span className="whitespace-nowrap">产品/开发</span>
            切换：产品可写入和确认版本，开发可查询、拆解并提交修改建议。
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
{%- else %}
{% raw %}"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  MessageSquareText,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "@/hooks";
import { ROUTES } from "@/lib/constants";

const workflow = [
  {
    title: "开始对话",
    description: "创建会话并围绕业务问题、文档或任务持续追问。",
    icon: MessageSquareText,
  },
  {
    title: "选择模型",
    description: "在对话控制里选择默认模型、温度和推理强度。",
    icon: Bot,
  },
  {
    title: "管理资料",
    description: "在 RAG 页面上传、检索和管理知识库文档。",
    icon: Database,
  },
  {
    title: "查看后台",
    description: "管理员可以检查用户、会话、评分和系统运行状态。",
    icon: ShieldCheck,
  },
];

const focusItems = [
  { label: "最近对话", value: "Chat", note: "继续已有上下文或创建新会话", href: ROUTES.CHAT },
  { label: "知识库", value: "RAG", note: "上传文档并执行检索问答", href: ROUTES.RAG },
  { label: "个人设置", value: "Me", note: "维护账号资料和偏好设置", href: ROUTES.PROFILE },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    { label: "运行模式", value: "MVP" },
    { label: "当前账号", value: user?.role === "admin" ? "管理员" : "成员" },
    { label: "主要入口", value: "对话/RAG" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5 pb-10">
      <section className="border-foreground/10 bg-card/80 overflow-hidden rounded-md border">
        <div className="grid min-h-[260px] lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex flex-col justify-between p-6 sm:p-8">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
                AI 工作台
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                对话、资料和后台管理集中在一个入口。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground/62">
                使用对话处理任务，结合 RAG 文档检索补充上下文，并通过管理后台查看系统运行状态。
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <PrimaryLink href={ROUTES.CHAT} label="开始对话" />
              <SecondaryLink href={ROUTES.RAG} label="打开知识库" />
            </div>
          </div>

          <div className="border-foreground/10 bg-foreground/[0.025] border-t p-5 lg:border-t-0 lg:border-l">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                快捷入口
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background px-2.5 py-1 text-[11px] text-foreground/60">
                <CheckCircle2 className="h-3 w-3 text-brand" />
                可用
              </span>
            </div>
            <div className="mt-4 divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
              {focusItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group grid grid-cols-[64px_1fr_auto] items-center gap-3 p-3 transition-colors hover:bg-foreground/[0.04]"
                >
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {item.value}
                  </p>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-foreground/50">
                      {item.note}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-foreground/35 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-foreground/10 bg-background px-3 py-3"
                >
                  <p className="whitespace-nowrap text-lg font-semibold tabular-nums text-foreground">
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
                推荐动作
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">继续推进</h2>
            </div>
            <Link
              href={ROUTES.CHAT}
              className="text-sm font-medium text-foreground underline underline-offset-4"
            >
              新建对话
            </Link>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <ActionTile
              href={ROUTES.CHAT}
              icon={MessageSquareText}
              title="打开对话"
              description="输入问题、上传上下文文件，并使用模型控制调整回答方式。"
            />
            <ActionTile
              href={ROUTES.RAG}
              icon={Database}
              title="管理知识库"
              description="上传文档、查看集合，并用检索结果支撑回答。"
            />
            <ActionTile
              href={ROUTES.SETTINGS}
              icon={Settings2}
              title="调整设置"
              description="维护账号、外观、通知和快捷指令。"
            />
            <ActionTile
              href={ROUTES.ADMIN}
              icon={ShieldCheck}
              title="进入后台"
              description="管理员查看用户、对话、评分和系统状态。"
            />
          </div>
        </div>

        <aside className="rounded-md border border-foreground/10 bg-card/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-foreground/45" />
              <h2 className="text-sm font-semibold text-foreground">当前会话</h2>
            </div>
            <CheckCircle2 className="h-4 w-4 text-brand" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/62">
            登录用户：{user?.email ?? "未登录"}。当前生成组合未启用组织级需求项目，首页会直接引导到对话和 RAG 管理。
          </p>
          <div className="mt-4 space-y-2">
            <RoleRow label="对话" value="提问、追问、保存上下文" />
            <RoleRow label="RAG" value="上传文档、检索资料、辅助回答" />
          </div>
        </aside>
      </section>
    </div>
  );
}

function ActionTile({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof MessageSquareText;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-foreground/10 bg-background p-4 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/55">
            {description}
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
      <Database className="h-4 w-4" />
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
{%- endif %}
