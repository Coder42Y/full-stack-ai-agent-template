{% raw %}"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, MessageSquare, Receipt, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  timestamp: string;
  href?: string;
  accent?: "default" | "brand" | "danger";
}

interface ConversationItem {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface CreditTx {
  id: string;
  delta: number;
  type: string;
  description?: string | null;
  created_at: string;
}

export function RecentActivity({ limit = 6 }: { limit?: number }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setItems(null);
    try {
      const [convResp, txResp] = await Promise.allSettled([
        apiClient.get<{ items: ConversationItem[] }>("/conversations?limit=5"),
        apiClient.get<{ items: CreditTx[] }>("/billing/me/credits/transactions?limit=5"),
      ]);

      const events: ActivityItem[] = [];

      if (convResp.status === "fulfilled") {
        for (const c of convResp.value.items.slice(0, 4)) {
          events.push({
            id: `conv-${c.id}`,
            icon: MessageSquare,
            title: c.title?.trim() || "新对话",
            description: "需求对话",
            timestamp: c.updated_at || c.created_at,
            href: `${ROUTES.CHAT}?id=${c.id}`,
          });
        }
      }

      if (txResp.status === "fulfilled") {
        for (const tx of txResp.value.items.slice(0, 4)) {
          const isPositive = tx.delta > 0;
          events.push({
            id: `tx-${tx.id}`,
            icon: isPositive ? Sparkles : tx.type === "subscription_renewal" ? Receipt : Coins,
            title:
              tx.description ||
              (isPositive
                ? `+${tx.delta.toLocaleString()} 点额度`
                : `${tx.delta.toLocaleString()} 点额度`),
            description: humanizeTxType(tx.type),
            timestamp: tx.created_at,
            accent: isPositive ? "brand" : tx.delta < 0 ? "default" : "default",
          });
        }
      }

      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setItems(events.slice(0, limit));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载活动失败");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  return (
    <div className="border-border bg-card flex h-full flex-col rounded-2xl border p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-foreground text-base font-semibold">最近活动</h2>
        <Link
          href={ROUTES.CHAT}
          className="text-foreground/55 hover:text-foreground font-mono text-[11px] uppercase tracking-wider"
        >
          查看全部
        </Link>
      </div>

      {items === null && !error && <LoadingState variant="skeleton-list" rows={4} />}
      {error && (
        <ErrorState
          title="无法加载活动"
          description={error}
          cta={{ label: "重试", onClick: load }}
        />
      )}
      {items && items.length === 0 && !error && (
        <EmptyState
          icon={MessageSquare}
          title="暂无活动"
          description="开始需求对话或上传 PRD 后，相关事件会显示在这里。"
          cta={{ label: "开始对话", href: ROUTES.CHAT }}
          fill
        />
      )}
      {items && items.length > 0 && (
        <ul className="-mx-2 flex-1 space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <ActivityRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const content = (
    <div
      className={cn(
        "hover:bg-foreground/[0.04] flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          item.accent === "brand"
            ? "bg-brand/15 text-foreground"
            : item.accent === "danger"
              ? "bg-destructive/10 text-destructive"
              : "bg-foreground/8 text-foreground/80",
        )}
      >
        <item.icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">{item.title}</p>
        <p className="text-foreground/55 truncate text-xs">
          {item.description}
          {item.description && " · "}
          {formatRelative(item.timestamp)}
        </p>
      </div>
    </div>
  );

  if (item.href) {
    return <Link href={item.href}>{content}</Link>;
  }
  return content;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function humanizeTxType(t: string): string {
  const labels: Record<string, string> = {
    subscription_renewal: "订阅续费",
    topup: "额度充值",
    usage: "额度消耗",
    adjustment: "额度调整",
  };
  return labels[t] ?? t.replace(/_/g, " ");
}
{% endraw %}
