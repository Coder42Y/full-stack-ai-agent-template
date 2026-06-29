"use client";

import { ArrowRight, Database, FileUp, RefreshCw, Route } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ChatAction, RequirementActionCard } from "@/types";

interface RequirementActionCardProps {
  card?: RequirementActionCard;
  actions?: ChatAction[];
  mode?: "ai" | "offline" | "workflow";
  onRetry?: (message?: string) => void;
}

export function RequirementActionCard({
  card,
  actions,
  mode = "workflow",
  onRetry,
}: RequirementActionCardProps) {
  const router = useRouter();
  const visibleActions = card?.actions ?? actions ?? [];
  if (!card && visibleActions.length === 0) return null;

  const runAction = (action: ChatAction) => {
    if (action.kind === "retry") {
      const message =
        typeof action.payload?.message === "string" ? action.payload.message : undefined;
      onRetry?.(message);
      return;
    }
    if (action.kind === "select_kb") {
      window.dispatchEvent(new CustomEvent("chat:open-controls", { detail: { tab: "kb" } }));
      return;
    }
    if (action.href) {
      router.push(action.href);
    }
  };

  const title = card?.title ?? (mode === "offline" ? "离线助手" : "需求动作");
  const summary =
    card?.summary ??
    (mode === "offline"
      ? "当前只提供导航和重试，不会伪造需求草稿或来源结论。"
      : "可以继续在聊天内推进，也可以进入需求工作台处理。");

  return (
    <div
      className={cn(
        "border-foreground/10 bg-card w-full rounded-lg border p-3 shadow-sm",
        mode === "offline" && "border-amber-500/25 bg-amber-500/[0.06]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            mode === "offline"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-brand/15 text-foreground",
          )}
        >
          {mode === "offline" ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Route className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">{summary}</p>
        </div>
      </div>

      {visibleActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant={action.kind === "retry" ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => runAction(action)}
            >
              <ActionIcon kind={action.kind} />
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionIcon({ kind }: { kind: string }) {
  if (kind === "retry") return <RefreshCw className="h-3.5 w-3.5" />;
  if (kind === "select_kb") return <Database className="h-3.5 w-3.5" />;
  if (kind === "upload") return <FileUp className="h-3.5 w-3.5" />;
  return <ArrowRight className="h-3.5 w-3.5" />;
}
