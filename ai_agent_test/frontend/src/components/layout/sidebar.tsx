"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { APP_NAME, ROUTES } from "@/lib/constants";
import {
  LayoutDashboard,
  MessageSquare,
  Database,
  UserCircle,
  ShieldAlert,
  Building2,
  CreditCard,
} from "lucide-react";
import { useSidebarStore, useAuthStore } from "@/stores";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui";

const navigation = [
  { labelKey: "dashboard", href: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { labelKey: "chat", href: ROUTES.CHAT, icon: MessageSquare },
  { labelKey: "kb", href: ROUTES.KB, icon: Database },
  { labelKey: "orgs", href: ROUTES.ORGS, icon: Building2 },
  { labelKey: "billing", href: ROUTES.BILLING, icon: CreditCard },
  { labelKey: "profile", href: ROUTES.PROFILE, icon: UserCircle },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const t = useTranslations("appNav");

  return (
    <nav className="flex-1 space-y-1 p-4">
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname?.endsWith(item.href);
        return (
          <Link
            key={item.labelKey}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
              "min-h-[44px]",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground",
            )}
          >
            <item.icon className="h-5 w-5" />
            {t(item.labelKey)}
          </Link>
        );
      })}
      {user?.role === "admin" && (
        <Link
          href={ROUTES.ADMIN}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
            "min-h-[44px]",
            pathname?.includes(ROUTES.ADMIN)
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground",
          )}
        >
          <ShieldAlert className="h-5 w-5" />
          {t("admin")}
        </Link>
      )}
    </nav>
  );
}

export function Sidebar() {
  const { isOpen, close } = useSidebarStore();

  return (
    <Sheet open={isOpen} onOpenChange={close}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="h-14 px-4">
          <SheetTitle>{APP_NAME}</SheetTitle>
          <SheetClose onClick={close} />
        </SheetHeader>
        <NavLinks onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
