"use client";

import { ArrowUpRight, BookOpenCheck, FileQuestion, GitBranch, MessageSquareText } from "lucide-react";

import { useAuth } from "@/hooks";
import { cn } from "@/lib/utils";

const PROMPTS = [
  {
    icon: FileQuestion,
    title: "澄清一句话需求",
    intent: "intake",
    prompt: "用户收货地址要支持海外地址，请帮我追问上线前必须确认的业务边界。",
  },
  {
    icon: MessageSquareText,
    title: "按来源回答开发问题",
    intent: "query",
    prompt: "海外地址支持哪些国家？请只基于需求文档回答，并标注来源。",
  },
  {
    icon: BookOpenCheck,
    title: "拆解开发与测试关注点",
    intent: "breakdown",
    prompt: "把当前需求拆成开发实现点和测试验收点，列出每一项的来源。",
  },
  {
    icon: GitBranch,
    title: "整理变更建议",
    intent: "change",
    prompt: "建议增加不支持国家的错误提示和客服引导，请整理成需求变更建议。",
  },
];

interface ChatEmptyStateProps {
  onPick: (prompt: string, intent?: string) => void;
  agentLabel?: string;
}

export function ChatEmptyState({ onPick, agentLabel = "需求 AI" }: ChatEmptyStateProps) {
  const { user } = useAuth();
  const name = user?.full_name || user?.email?.split("@")[0] || "MVP 管理员";

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 py-10 text-center md:py-16">
      <div className="flex flex-col items-center">
        <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-foreground/55">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand shadow-[0_0_8px_var(--color-brand)]"
          />
          {agentLabel}
        </span>

        <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          {name}，这里是需求对话入口
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/65 md:text-base">
          用自然语言和需求知识库交互：让 AI 追问澄清、基于来源回答开发问题、
          拆解实现与测试关注点，或者把修改诉求整理成版本变更建议。
        </p>
      </div>

      <div className="mt-10 grid w-full gap-3 sm:grid-cols-2">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt.title}
            type="button"
            onClick={() => onPick(prompt.prompt, prompt.intent)}
            className={cn(
              "group relative flex min-h-[132px] items-start gap-4 rounded-lg border border-foreground/10 bg-card p-5 text-left transition-colors",
              "hover:border-foreground/25 hover:bg-foreground/[0.02]",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand/15 text-foreground">
              <prompt.icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{prompt.title}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-foreground/55">
                {prompt.prompt}
              </p>
            </div>

            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground/[0.04] text-foreground/45 transition-transform group-hover:translate-x-0.5">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
