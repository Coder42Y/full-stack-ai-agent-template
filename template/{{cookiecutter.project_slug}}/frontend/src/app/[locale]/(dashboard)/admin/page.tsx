"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
{%- if cookiecutter.enable_billing %}
  CreditCard,
{%- endif %}
  MessageSquare,
  RefreshCw,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LoadingState } from "@/components/states";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface AdminStats {
  total_users?: number;
  active_users_24h?: number;
  total_conversations?: number;
  total_messages?: number;
  credits_charged_30d?: number;
  mrr_cents?: number;
}

interface RecentEvent {
  id: string;
  type: "user_signup" | "conversation_created" | "subscription_renewed" | "rating_low";
  title: string;
  description: string;
  timestamp: string;
}

const EVENT_ICON: Record<RecentEvent["type"], LucideIcon> = {
  user_signup: UserPlus,
  conversation_created: MessageSquare,
{%- if cookiecutter.enable_billing %}
  subscription_renewed: CreditCard,
{%- else %}
  subscription_renewed: Activity,
{%- endif %}
  rating_low: Star,
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((Date.now() - t) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [events, setEvents] = useState<RecentEvent[] | null>(null);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      // Best-effort: call the backend admin stats endpoint if it exists.
      // Falls back to per-resource counts otherwise.
      const data = await apiClient.get<AdminStats>("/admin/stats").catch(() => null);
      if (data) {
        setStats(data);
      } else {
        const [usersResp, convsResp] = await Promise.allSettled([
          apiClient.get<{ total: number }>("/admin/users?limit=1"),
          apiClient.get<{ total: number }>("/admin/conversations?limit=1"),
        ]);
        setStats({
          total_users: usersResp.status === "fulfilled" ? usersResp.value.total : undefined,
          total_conversations: convsResp.status === "fulfilled" ? convsResp.value.total : undefined,
        });
      }
    } finally {
      setStatsLoading(false);
    }
  };

  const loadEvents = async () => {
    setEvents(null);
    try {
      // Backend wishlist: /admin/events. Fall back to recent conversations as
      // a stand-in so the surface isn't empty.
      const events = await apiClient
        .get<{ items: RecentEvent[] }>("/admin/events")
        .catch(() => null);
      if (events) {
        setEvents(events.items.slice(0, 8));
        return;
      }
      const convs = await apiClient
        .get<{
          items: Array<{ id: string; user_email?: string; title?: string; created_at: string }>;
        }>("/admin/conversations?limit=8")
        .catch(() => ({ items: [] }));
      setEvents(
        convs.items.map((c) => ({
          id: c.id,
          type: "conversation_created" as const,
          title: c.title || "新的需求对话",
          description: c.user_email ? `来自 ${c.user_email}` : "",
          timestamp: c.created_at,
        })),
      );
    } catch {
      setEvents([]);
    }
  };

  useEffect(() => {
    loadStats();
    loadEvents();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase">
            总览
          </p>
          <h2 className="font-display text-foreground mt-1 text-xl font-semibold tracking-tight">
            工作区运行概览
          </h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            loadStats();
            loadEvents();
          }}
          className="rounded-full"
        >
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", statsLoading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {/* Stats strip */}
      {statsLoading ? (
        <LoadingState variant="stats" rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="用户总数"
            value={(stats?.total_users ?? 0).toLocaleString()}
            icon={Users}
          />
          <StatCard
            label="24 小时活跃"
            value={(stats?.active_users_24h ?? 0).toLocaleString()}
            icon={Activity}
            featured
          />
{%- if cookiecutter.use_ai %}
          <StatCard
            label="需求对话"
            value={(stats?.total_conversations ?? 0).toLocaleString()}
            icon={MessageSquare}
          />
{%- endif %}
{%- if cookiecutter.enable_billing %}
          <StatCard
            label="MRR"
            value={
              typeof stats?.mrr_cents === "number"
                ? (stats.mrr_cents / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 0,
                  })
                : "—"
            }
            icon={CreditCard}
          />
{%- endif %}
        </div>
      )}

      {/* Quick actions */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          href="/admin/users"
          icon={Users}
          title="用户管理"
          description="查看、停用、管理员调试"
        />
{%- if cookiecutter.use_ai %}
        <QuickLink
          href="/admin/conversations"
          icon={MessageSquare}
          title="需求对话"
          description="查看所有需求协作对话"
        />
{%- endif %}
{%- if cookiecutter.enable_billing %}
        <QuickLink
          href="/admin/stripe-events"
          icon={CreditCard}
          title="支付事件"
          description="排查账单回调"
        />
{%- endif %}
        <QuickLink
          href="/admin/system"
          icon={Activity}
          title="系统健康"
          description="检查后端服务状态"
        />
{%- if cookiecutter.use_ai %}
        <QuickLink
          href="/admin/ratings"
          icon={Star}
          title="回答评分"
          description="跟踪 AI 回答质量反馈"
        />
{%- endif %}
      </section>

      {/* Recent activity */}
      <section className="border-foreground/10 bg-card rounded-2xl border">
        <div className="border-foreground/10 flex items-center justify-between border-b px-6 py-5">
          <div>
            <h2 className="font-display text-foreground text-base font-semibold tracking-tight">
              最近活动
            </h2>
            <p className="text-foreground/55 text-xs">
              工作区内的需求对话与管理事件。后续可接入{" "}
              <code className="font-mono">/admin/events</code> 形成完整审计流。
            </p>
          </div>
        </div>
        {events === null ? (
          <div className="p-6">
            <LoadingState variant="skeleton-list" rows={5} />
          </div>
        ) : events.length === 0 ? (
          <div className="border-foreground/10 m-6 rounded-xl border-2 border-dashed p-10 text-center">
            <p className="text-foreground/65 text-sm">暂无最近活动。</p>
          </div>
        ) : (
          <ul className="divide-foreground/10 divide-y">
            {events.map((e) => {
              const Icon = EVENT_ICON[e.type] ?? MessageSquare;
              return (
                <li key={e.id} className="flex items-center gap-3 px-6 py-4">
                  <span className="bg-foreground/8 text-foreground/80 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">{e.title}</p>
                    <p className="text-foreground/55 truncate text-xs">
                      {e.description}
                      {e.description && " · "}
                      {formatRelative(e.timestamp)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

{% raw %}function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="lift border-foreground/10 hover:border-brand/40 bg-card group flex items-center gap-3 rounded-2xl border p-4 transition-all"
    >
      <span className="bg-brand/15 text-foreground group-hover:bg-brand group-hover:text-brand-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-semibold">{title}</p>
        <p className="text-foreground/55 truncate text-xs">{description}</p>
      </div>
      <ArrowUpRight className="text-foreground/30 group-hover:text-foreground h-4 w-4 transition-all group-hover:rotate-45" />
    </Link>
  );
}
{% endraw %}
