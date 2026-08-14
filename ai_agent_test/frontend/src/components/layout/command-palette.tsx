"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Command } from "cmdk";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Star,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "@/hooks";
import { apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

interface ConversationItem {
  id: string;
  title: string | null;
  updated_at?: string | null;
}

export function CommandPalette() {
  const router = useRouter();
  const t = useTranslations("layout");
  const tAppNav = useTranslations("appNav");
  const tAdmin = useTranslations("admin");
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Fetch recent conversations once when opened
  useEffect(() => {
    if (!open) return;
    if (conversations.length > 0) return;
    apiClient
      .get<{ items: ConversationItem[] }>("/conversations?limit=10")
      .then((d) => setConversations(d.items))
      .catch(() => setConversations([]));
  }, [open, conversations.length]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t("commandPalette")}
      shouldFilter
      overlayClassName="bg-background/50 fixed inset-0 z-[60] backdrop-blur-sm"
      contentClassName="border-foreground/15 bg-card text-foreground fixed left-1/2 top-[12vh] z-[61] w-[min(92vw,640px)] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl"
    >
      <div className="border-foreground/10 flex items-center gap-3 border-b px-4 py-3">
        <Search className="text-foreground/45 h-4 w-4" />
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder={t("commandPaletteSearchPlaceholder")}
          className="text-foreground placeholder:text-foreground/45 flex-1 bg-transparent text-sm outline-none"
        />
        <kbd className="border-foreground/15 text-foreground/55 hidden rounded-md border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
          ESC
        </kbd>
      </div>

      <Command.List className="max-h-[60vh] overflow-y-auto px-2 py-2">
        <Command.Empty className="text-foreground/55 px-4 py-10 text-center text-sm">
          {t("noMatches")}
        </Command.Empty>

        <Group heading={t("quickActions")}>
          <PaletteItem
            icon={Plus}
            label={t("startNewChat")}
            onSelect={() => go(ROUTES.CHAT)}
            shortcut="⌘N"
          />
          <PaletteItem
            icon={Database}
            label={t("uploadToKnowledgeBase")}
            onSelect={() => go(ROUTES.RAG)}
          />
          <PaletteItem icon={Users} label={t("inviteTeammates")} onSelect={() => go(ROUTES.ORGS)} />
        </Group>

        {conversations.length > 0 && (
          <Group heading={t("recentConversations")}>
            {conversations.slice(0, 8).map((c) => (
              <PaletteItem
                key={c.id}
                icon={MessageSquare}
                label={c.title?.trim() || t("untitledConversation")}
                onSelect={() => go(`${ROUTES.CHAT}?id=${c.id}`)}
              />
            ))}
          </Group>
        )}

        <Group heading={t("navigate")}>
          <PaletteItem
            icon={LayoutDashboard}
            label={tAppNav("dashboard")}
            onSelect={() => go(ROUTES.DASHBOARD)}
          />
          <PaletteItem icon={MessageSquare} label={tAppNav("chat")} onSelect={() => go(ROUTES.CHAT)} />
          <PaletteItem icon={Database} label={tAppNav("kb")} onSelect={() => go(ROUTES.KB)} />
          <PaletteItem icon={Building2} label={tAppNav("orgs")} onSelect={() => go(ROUTES.ORGS)} />
          <PaletteItem icon={CreditCard} label={tAppNav("billing")} onSelect={() => go(ROUTES.BILLING)} />
          <PaletteItem icon={UserCircle} label={tAppNav("profile")} onSelect={() => go(ROUTES.PROFILE)} />
          <PaletteItem icon={Settings} label={tAppNav("settings")} onSelect={() => go(ROUTES.SETTINGS)} />
          <PaletteItem
            icon={BookOpen}
            label={t("apiDocumentation")}
            onSelect={() => {
              setOpen(false);
              window.open("/docs", "_blank");
            }}
          />
        </Group>
        {user?.role === "admin" && (
          <Group heading={tAppNav("admin")}>
            <PaletteItem
              icon={Star}
              label={tAdmin("ratingsTitle")}
              onSelect={() => go(ROUTES.ADMIN_RATINGS)}
            />
            <PaletteItem
              icon={Activity}
              label={t("allConversations")}
              onSelect={() => go(ROUTES.ADMIN_CONVERSATIONS)}
            />
          </Group>
        )}

        <Group heading={t("account")}>
          <PaletteItem
            icon={LogOut}
            label={tAppNav("logout")}
            onSelect={() => {
              setOpen(false);
              logout();
            }}
          />
        </Group>
      </Command.List>

      <div className="border-foreground/10 text-foreground/45 flex items-center justify-between border-t px-4 py-2 font-mono text-[10px] tracking-wider uppercase">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="border-foreground/15 rounded border px-1 py-0.5">↑↓</kbd>
          {t("navigate")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="border-foreground/15 rounded border px-1 py-0.5">↵</kbd>
          {t("open")}
        </span>
      </div>
    </Command.Dialog>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:text-foreground/45 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function PaletteItem({
  icon: Icon,
  label,
  onSelect,
  shortcut,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="text-foreground/85 hover:bg-foreground/5 data-[selected=true]:bg-foreground/8 data-[selected=true]:text-foreground flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <span className="flex-1 truncate">{label}</span>
      {shortcut ? (
        <kbd className="border-foreground/15 text-foreground/55 rounded border px-1.5 py-0.5 font-mono text-[10px]">
          {shortcut}
        </kbd>
      ) : (
        <ArrowRight className="text-foreground/30 h-3.5 w-3.5 opacity-0 transition-opacity data-[selected=true]:opacity-100" />
      )}
    </Command.Item>
  );
}
