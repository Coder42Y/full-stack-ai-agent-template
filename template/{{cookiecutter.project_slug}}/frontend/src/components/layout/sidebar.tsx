"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import {
  LayoutDashboard,
  MessageSquare,
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  Database,
{%- endif %}
  UserCircle,
  ShieldAlert,
{%- if cookiecutter.enable_teams %}
  Building2,
{%- endif %}
{%- if cookiecutter.enable_billing %}
  CreditCard,
{%- endif %}
} from "lucide-react";
import { useSidebarStore, useAuthStore } from "@/stores";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui";

const navigation = [
  { name: "首页", href: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { name: "对话", href: ROUTES.CHAT, icon: MessageSquare },
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  { name: "需求项目", href: ROUTES.KB, icon: Database },
{%- endif %}
{%- if cookiecutter.enable_teams %}
  { name: "组织", href: ROUTES.ORGS, icon: Building2 },
{%- endif %}
{%- if cookiecutter.enable_billing %}
  { name: "账单", href: ROUTES.BILLING, icon: CreditCard },
{%- endif %}
  { name: "个人资料", href: ROUTES.PROFILE, icon: UserCircle },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const stripped = pathname.replace(/^\/[a-z]{2}/, "");

  return (
    <nav className="flex-1 space-y-1 p-3">
      {navigation.map((item) => {
        const isActive = stripped === item.href || stripped.startsWith(item.href + "/");
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
              "min-h-[44px]",
              isActive
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
      {user?.role === "admin" && (
        <Link
          href={ROUTES.ADMIN}
          onClick={onNavigate}
          className={cn(
            "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
            "min-h-[44px]",
            stripped.startsWith("/admin")
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
          )}
        >
          <ShieldAlert className="h-5 w-5" />
          管理后台
        </Link>
      )}
    </nav>
  );
}

export function Sidebar() {
  const { isOpen, close } = useSidebarStore();

  return (
    <Sheet open={isOpen} onOpenChange={close}>
      <SheetContent side="left" className="w-72 border-r border-foreground/10 bg-background/95 p-0 backdrop-blur-xl">
        <SheetHeader className="h-14 border-b border-foreground/10 px-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-[11px] font-bold text-background">
              需
            </span>
            需求知识库
          </SheetTitle>
          <SheetClose onClick={close} />
        </SheetHeader>
        <NavLinks onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
