"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Globe, Monitor, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/settings-section";
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
  Input,
  Label,
} from "@/components/ui";
import { useAuth } from "@/hooks";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { Session, SessionListResponse, User } from "@/types";

function DeviceIcon({ type }: { type?: string | null }) {
  if (type === "mobile") return <Smartphone className="h-4 w-4" />;
  if (type === "desktop") return <Monitor className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

export default function ProfileSettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tp = useTranslations("profile");
  const ta = useTranslations("auth");
  const { user } = useAuth();
  const { setUser } = useAuthStore();

  const formatTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("profile.timeAgo.justNow");
    if (minutes < 60) return t("profile.timeAgo.minutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("profile.timeAgo.hours", { count: hours });
    const days = Math.floor(hours / 24);
    return t("profile.timeAgo.days", { count: days });
  };

  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  // Backend may not have a sessions endpoint when `enable_session_management`
  // is off (stateless JWT). Track availability so we can hide the whole section
  // instead of showing a misleading "no data" placeholder.
  const [sessionsAvailable, setSessionsAvailable] = useState(true);

  useEffect(() => {
    setName(user?.full_name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.id, user?.email, user?.full_name]);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiClient.get<SessionListResponse>("/sessions");
      setSessions(data.sessions);
      setSessionsAvailable(true);
    } catch (err) {
      // 404 = endpoint not exposed (session management disabled at gen time).
      if (err instanceof ApiError && err.status === 404) {
        setSessionsAvailable(false);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: { email?: string; full_name?: string | null } = {};
      if (email !== user.email) payload.email = email;
      if (name !== (user.full_name ?? "")) payload.full_name = name || null;
      if (Object.keys(payload).length === 0) {
        toast.info(t("profile.nothingChanged"));
        setSaving(false);
        return;
      }
      const updated = await apiClient.patch<User>("/users/me", payload);
      setUser(updated);
      toast.success(t("profile.profileUpdated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("profile.profileUpdateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("profile.avatarTooLarge"));
      return;
    }
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/users/me/avatar", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: t("profile.uploadFailed") }));
        throw new Error(err.detail || t("profile.uploadFailed"));
      }
      const updated = await res.json();
      setUser(updated);
      toast.success(t("profile.avatarUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profile.avatarUploadFailed"));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success(t("profile.sessionRevoked"));
    } catch {
      toast.error(t("profile.sessionRevokeFailed"));
    }
  };

  const handleRevokeAll = async () => {
    try {
      await apiClient.delete("/sessions");
      setSessions((prev) => prev.filter((s) => s.is_current));
      toast.success(t("profile.allOtherSessionsRevoked"));
    } catch {
      toast.error(t("profile.sessionsRevokeFailed"));
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title={t("profile.avatar")}
        description={t("profile.avatarDescription")}
      >
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="bg-brand/15 ring-brand/20 hover:ring-brand/60 group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 transition-all"
            style={{ boxShadow: "0 0 32px oklch(from var(--color-brand) l c h / 0.25)" }}
          >
            {user.avatar_url ? (
              <Image
                src={`/api/users/avatar/${user.id}`}
                alt=""
                width={96}
                height={96}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-foreground font-mono text-xl font-semibold">
                {(user.full_name || user.email).slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            className="hidden"
          />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="rounded-full"
            >
              {avatarUploading
                ? t("profile.uploading")
                : user.avatar_url
                  ? t("profile.replaceAvatar")
                  : t("profile.uploadAvatar")}
            </Button>
            <p className="text-foreground/55 mt-2 text-xs">
              {user.role === "admin" ? t("profile.adminPrefix") : ""}
              {t("profile.memberSince", {
                date: user.created_at
                  ? new Date(user.created_at).toLocaleDateString()
                  : "—",
              })}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={tp("personalInfo")}
        description={t("profile.personalInfoDescription")}
        action={
          <Button onClick={handleSaveProfile} disabled={saving} size="sm" className="rounded-full">
            {saving ? tc("saving") : t("saveChanges")}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="profile-name"
              className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
            >
              {t("profile.displayName")}
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ta("namePlaceholder")}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="profile-email"
              className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
            >
              {tp("email")}
            </Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-xl"
            />
            <p className="text-foreground/55 text-xs">{t("profile.emailHint")}</p>
          </div>
        </div>
      </SettingsSection>

      {sessionsAvailable && (
        <SettingsSection
          title={t("profile.activeSessions")}
          description={t("profile.activeSessionsDescription")}
          action={
            sessions.filter((s) => !s.is_current).length > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full">
                    {t("profile.revokeAllOthers")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("profile.revokeAllConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("profile.revokeAllConfirmDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevokeAll}>
                      {t("profile.revokeAll")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null
          }
        >
          {sessionsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="bg-foreground/8 h-14 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-foreground/55 text-sm">{t("profile.noSessionData")}</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className={cn(
                    "relative flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all",
                    session.is_current
                      ? "border-brand/30 bg-brand/[0.06]"
                      : "border-foreground/10 bg-background hover:border-foreground/25",
                  )}
                >
                  {session.is_current && (
                    <span
                      aria-hidden
                      className="bg-brand absolute top-1/2 left-0 h-6 w-0.5 -translate-y-1/2 rounded-r-full"
                      style={{ boxShadow: "0 0 8px var(--color-brand)" }}
                    />
                  )}
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        session.is_current
                          ? "bg-brand text-brand-foreground"
                          : "bg-foreground/8 text-foreground/70",
                      )}
                    >
                      <DeviceIcon type={session.device_type} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">
                          {session.device_name || t("profile.unknownDevice")}
                        </span>
                        {session.is_current && (
                          <span className="bg-brand/15 text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase">
                            <span
                              aria-hidden
                              className="bg-brand h-1 w-1 animate-pulse rounded-full"
                            />
                            {t("profile.currentBadge")}
                          </span>
                        )}
                      </p>
                      <p className="text-foreground/55 truncate text-xs">
                        {session.ip_address && `${session.ip_address} · `}
                        {t("profile.lastActive", { time: formatTimeAgo(session.last_used_at) })}
                      </p>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-foreground/55 hover:bg-destructive/10 hover:text-destructive h-8 shrink-0"
                      onClick={() => handleRevokeSession(session.id)}
                      title={t("profile.revokeSessionTitle")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
      )}
    </div>
  );
}
