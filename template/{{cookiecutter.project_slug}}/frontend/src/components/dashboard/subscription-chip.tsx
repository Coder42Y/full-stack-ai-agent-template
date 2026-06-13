"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Sparkles, XCircle } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { SubscriptionRead } from "@/types";

const TONE: Record<string, string> = {
  trialing: "bg-foreground/[0.04] text-foreground/80 border-foreground/15",
  active: "bg-brand/15 text-foreground border-foreground/15",
  past_due: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  canceled: "bg-destructive/10 text-destructive border-destructive/30",
  unpaid: "bg-destructive/10 text-destructive border-destructive/30",
  incomplete: "bg-foreground/[0.04] text-foreground/65 border-foreground/15",
  incomplete_expired: "bg-foreground/[0.04] text-foreground/55 border-foreground/15",
  paused: "bg-foreground/[0.04] text-foreground/65 border-foreground/15",
  free: "border-foreground/15 text-foreground/65",
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

export function SubscriptionChip() {
  const [sub, setSub] = useState<SubscriptionRead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SubscriptionRead | null>("/billing/me/subscription")
      .then((d) => {
        if (!cancelled) setSub(d);
      })
      .catch(() => {
        if (!cancelled) setSub(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <span className="bg-foreground/8 inline-block h-5 w-24 animate-pulse rounded-full" />
    );
  }

  // No subscription = free tier
  if (!sub) {
    return (
      <Link
        href="/pricing"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
          TONE.free,
          "hover:border-foreground/40 hover:text-foreground",
        )}
      >
        <Sparkles className="h-3 w-3" />
        免费版 · 升级
        <ArrowUpRight className="h-2.5 w-2.5" />
      </Link>
    );
  }

  const status = sub.status;
  const trialDays = daysUntil(sub.trial_end);
  const renewDays = daysUntil(sub.current_period_end);

  // Choose label + icon based on status
  let label: string;
  let icon = <Clock className="h-3 w-3" />;

  if (status === "trialing" && trialDays !== null) {
    label = `试用 · 剩余 ${trialDays} 天`;
  } else if (status === "active" && sub.cancel_at_period_end && renewDays !== null) {
    label = `${renewDays} 天后结束`;
    icon = <XCircle className="h-3 w-3" />;
  } else if (status === "active" && renewDays !== null) {
    label = `有效 · ${renewDays} 天后续费`;
  } else if (status === "canceled") {
    label = renewDays !== null ? `已取消 · 还可访问 ${renewDays} 天` : "已取消";
    icon = <XCircle className="h-3 w-3" />;
  } else if (status === "past_due") {
    label = "付款逾期，请更新支付方式";
  } else {
    label = status.replace(/_/g, " ");
  }

  return (
    <Link
      href="/billing/subscription"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-wider uppercase transition-colors hover:opacity-80",
        TONE[status] ?? TONE.free,
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
