import Link from "next/link";
import { BookOpen, CreditCard, Database, MessageSquare, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BACKEND_URL, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  icon: LucideIcon;
  href: string;
  external?: boolean;
  featured?: boolean;
}

const ACTIONS: Action[] = [
  { label: "开始分析", icon: MessageSquare, href: ROUTES.CHAT, featured: true },
  { label: "运营知识库", icon: Database, href: ROUTES.RAG },
  { label: "团队成员", icon: Users, href: ROUTES.ORGS },
  { label: "用量额度", icon: CreditCard, href: ROUTES.BILLING },
  { label: "系统设置", icon: Settings, href: ROUTES.SETTINGS },
  { label: "API 文档", icon: BookOpen, href: `${BACKEND_URL}/docs`, external: true },
];

export function QuickActions() {
  return (
    <div className="border-border bg-card rounded-2xl border p-4 sm:p-5">
      <h2 className="text-foreground/55 mb-2.5 font-mono text-[11px] tracking-wider uppercase">
        快捷操作
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((action) => (
          <ActionPill key={action.label} action={action} />
        ))}
      </div>
    </div>
  );
}

function ActionPill({ action }: { action: Action }) {
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        action.featured
          ? "bg-foreground text-background border-foreground hover:bg-foreground/90"
          : "border-foreground/15 text-foreground hover:border-foreground/40 hover:bg-foreground/[0.04]",
      )}
    >
      <action.icon className="h-3.5 w-3.5 shrink-0" />
      {action.label}
    </span>
  );

  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return <Link href={action.href}>{inner}</Link>;
}
