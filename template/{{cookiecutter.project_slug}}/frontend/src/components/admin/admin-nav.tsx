"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
{%- if cookiecutter.enable_billing %}
  CreditCard,
{%- endif %}
  LayoutDashboard,
{%- if cookiecutter.use_ai %}
  MessageSquare,
  Star,
{%- endif %}
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
}

const ITEMS: NavItem[] = [
  { label: "总览", href: "/admin", icon: LayoutDashboard },
  { label: "用户", href: "/admin/users", icon: Users },
{%- if cookiecutter.use_ai %}
  { label: "对话", href: "/admin/conversations", icon: MessageSquare },
  { label: "评分", href: "/admin/ratings", icon: Star },
{%- endif %}
{%- if cookiecutter.enable_billing %}
  { label: "支付事件", href: "/admin/stripe-events", icon: CreditCard },
{%- endif %}
  { label: "系统健康", href: "/admin/system", icon: Activity },
];

export function AdminNav() {
  const pathname = usePathname();
  const stripped = pathname.replace(/^\/[a-z]{2}/, "");

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <nav className="hidden lg:block">
        <p className="mb-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground/45">
          管理后台
        </p>
        <ul className="space-y-0.5">
          {ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? stripped === "/admin"
                : stripped === item.href || stripped.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                    active
                      ? "bg-foreground/[0.08] text-foreground"
                      : "text-foreground/65 hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-foreground" : "text-foreground/40 group-hover:text-foreground",
                    )}
                  />
                  <span className="font-medium">{item.label}</span>
                  {active && (
                    <span aria-hidden className="bg-brand ml-auto h-1.5 w-1.5 rounded-full" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile: horizontal pill scroll */}
      <nav className="scrollbar-thin -mx-2 flex gap-1.5 overflow-x-auto px-2 lg:hidden">
        {ITEMS.map((item) => {
          const active =
            item.href === "/admin"
              ? stripped === "/admin"
              : stripped === item.href || stripped.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-foreground/15 px-3 text-sm font-medium transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "text-foreground/65 hover:border-foreground/40 hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
