"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks";
import { Button } from "@/components/ui";
import { LanguageSwitcherCompact } from "@/components/language-switcher";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  LogOut,
  Menu,
  LayoutDashboard,
  MessageSquare,
  Database,
  UserCircle,
  Building2,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui";
import { useSidebarStore } from "@/stores";
import { OrgSwitcher } from "@/components/teams";

const adminNavItems = [
  { labelKey: "dashboard", href: ROUTES.DASHBOARD, icon: LayoutDashboard, adminOnly: false },
  { labelKey: "chat", href: ROUTES.CHAT, icon: MessageSquare, adminOnly: false },
  { labelKey: "kb", href: ROUTES.KB, icon: Database, adminOnly: false },
  { labelKey: "orgs", href: ROUTES.ORGS, icon: Building2, adminOnly: false },
  { labelKey: "billing", href: ROUTES.BILLING, icon: CreditCard, adminOnly: false },
  { labelKey: "profile", href: ROUTES.PROFILE, icon: UserCircle, adminOnly: false },
  { labelKey: "admin", href: ROUTES.ADMIN, icon: ShieldCheck, adminOnly: true },
];

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const { toggle } = useSidebarStore();
  const pathname = usePathname();
  const t = useTranslations("appNav");

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="flex h-14 items-center justify-between px-3 sm:px-6">
        {/* Left: mobile menu + app name + nav */}
        <div className="flex items-center gap-1 sm:gap-4">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 md:hidden" onClick={toggle}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">{t("openMenu")}</span>
          </Button>

          <Link href={ROUTES.DASHBOARD} className="text-sm font-bold tracking-tight sm:text-base">
            {APP_NAME}
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden items-center gap-0.5 md:flex">
            {adminNavItems
              .filter((item) => !item.adminOnly || user?.role === "admin")
              .map((item) => {
                const isActive = pathname?.includes(item.href);
                return (
                  <Link
                    key={item.labelKey}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* Right: org switcher, language, user */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isAuthenticated && <OrgSwitcher />}
          <LanguageSwitcherCompact />
          {isAuthenticated ? (
            <>
              <Button variant="ghost" size="sm" asChild className="h-10 px-2 sm:px-3">
                <Link href={ROUTES.PROFILE} className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    {user?.avatar_url && (
                      <AvatarImage src={`/api/users/avatar/${user.id}`} alt={user.email} />
                    )}
                    <AvatarFallback className="bg-foreground text-background text-[10px] font-semibold">
                      {user?.email?.substring(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-32 truncate sm:inline">{user?.email}</span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-10 w-10 p-0 sm:w-auto sm:px-3"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-2">{t("logout")}</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="h-10">
                <Link href={ROUTES.LOGIN}>{t("login")}</Link>
              </Button>
              <Button size="sm" asChild className="h-10">
                <Link href={ROUTES.REGISTER}>{t("register")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
