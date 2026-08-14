"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, KeyRound, Mail, Shield, ShieldOff, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { LoadingState } from "@/components/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Sheet,
  SheetContent,
} from "@/components/ui";
import type { AdminUserRead } from "@/hooks/use-admin-users";
import { apiClient } from "@/lib/api-client";

interface UserDetailDrawerProps {
  user: AdminUserRead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (userId: string, patch: Partial<AdminUserRead>) => void;
  onDelete: (userId: string) => void;
  onImpersonate: (userId: string) => Promise<string | null | undefined>;
}

interface ConversationStub {
  id: string;
  title?: string | null;
  created_at: string;
  message_count?: number;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserDetailDrawer({
  user,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onImpersonate,
}: UserDetailDrawerProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [conversations, setConversations] = useState<ConversationStub[] | null>(null);
  const [convsLoading, setConvsLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) {
      setConversations(null);
      return;
    }
    setConvsLoading(true);
    apiClient
      .get<{ items: ConversationStub[] }>(`/admin/conversations?user_id=${user.id}&limit=8`)
      .then((d) => setConversations(d.items))
      .catch(() => setConversations([]))
      .finally(() => setConvsLoading(false));
  }, [open, user]);

  if (!user) return null;

  const handleImpersonate = async () => {
    const token = await onImpersonate(user.id);
    if (token) {
      try {
        await navigator.clipboard.writeText(token);
        toast.success(t("impersonationTokenCopied"));
      } catch {
        toast.success(t("impersonationTokenCreated"));
      }
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      toast.success(t("userIdCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const initials = (user.full_name || user.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="border-foreground/10 bg-card flex w-full max-w-md flex-col overflow-hidden p-0 sm:max-w-lg"
      >
        {/* Header */}
        <header className="border-foreground/10 flex items-center gap-4 border-b px-6 py-5">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={`/api/users/avatar/${user.id}`} alt={user.email} />
            <AvatarFallback className="font-mono text-sm">{initials || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-base font-semibold">
              {user.full_name || user.email.split("@")[0]}
            </p>
            <p className="text-foreground/55 truncate text-xs">{user.email}</p>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 scrollbar-thin overflow-y-auto px-6 py-5">
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={user.is_active ? "default" : "secondary"} className="text-[10px]">
              {user.is_active ? t("active") : t("suspended")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" />
              {user.role}
            </Badge>
            {user.is_app_admin && (
              <Badge className="bg-brand text-brand-foreground border-transparent text-[10px]">
                {t("appAdmin")}
              </Badge>
            )}
          </div>

          {/* Profile fields */}
          <dl className="border-foreground/10 divide-foreground/10 mt-5 divide-y rounded-xl border">
            <KV label={t("userId")} value={user.id} mono onCopy={handleCopyId} />
            <KV label={t("email")} value={user.email} mono />
            {user.full_name && <KV label={t("displayName")} value={user.full_name} />}
            <KV label={t("joined")} value={formatDateTime(user.created_at)} />
            <KV label={t("role")} value={user.role} mono />
          </dl>

          {/* Recent conversations */}
          <section className="mt-7">
            <h3 className="text-foreground/55 mb-3 font-mono text-[11px] tracking-wider uppercase">
              {t("recentConversations")}
            </h3>
            {convsLoading ? (
              <LoadingState variant="skeleton-list" rows={3} />
            ) : !conversations || conversations.length === 0 ? (
              <p className="text-foreground/55 text-xs">{t("noConversationsShort")}</p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li
                    key={c.id}
                    className="border-foreground/10 bg-background flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-xs font-medium">
                        {c.title || t("untitled")}
                      </p>
                      <p className="text-foreground/45 truncate font-mono text-[10px] tracking-wider uppercase">
                        {formatDateTime(c.created_at)}
                        {typeof c.message_count === "number" &&
                          ` · ${t("msgCount", { count: c.message_count })}`}
                      </p>
                    </div>
                    <a
                      href={`/admin/conversations?id=${c.id}`}
                      className="text-foreground/55 hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
                      title={t("openConversation")}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer actions */}
        <footer className="border-foreground/10 flex flex-wrap items-center gap-2 border-t px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUpdate(user.id, { is_active: !user.is_active })}
            className="rounded-full"
          >
            {user.is_active ? (
              <>
                <UserX className="mr-1.5 h-3.5 w-3.5" />
                {t("suspend")}
              </>
            ) : (
              <>
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                {t("reactivate")}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUpdate(user.id, { is_app_admin: !user.is_app_admin })}
            className="rounded-full"
          >
            {user.is_app_admin ? (
              <>
                <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                {t("demote")}
              </>
            ) : (
              <>
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                {t("promoteToAdmin")}
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleImpersonate} className="rounded-full">
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            {t("impersonate")}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive ml-auto rounded-full"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {tc("delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteUserConfirm", { email: user.email })}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteUserWarning")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onDelete(user.id);
                    onOpenChange(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("deleteUserAction")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function KV({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  const t = useTranslations("admin");
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-foreground/55 font-mono text-[10px] tracking-wider uppercase">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className={mono ? "text-foreground font-mono text-xs" : "text-foreground text-xs"}>
          {value}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-foreground/45 hover:text-foreground inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
            title={t("copy")}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </dd>
    </div>
  );
}
