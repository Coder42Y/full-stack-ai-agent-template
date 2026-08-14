"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Lock } from "lucide-react";
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
  Button,
  Input,
  Label,
} from "@/components/ui";
import { useAuth } from "@/hooks";
import { apiClient, ApiError } from "@/lib/api-client";

export default function AccountSettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tp = useTranslations("profile");
  const ta = useTranslations("auth");
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error(t("account.newPasswordMinLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(ta("passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/auth/password/change", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(t("account.passwordUpdated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      // Backend may not have this endpoint yet — surface a helpful message.
      if (err instanceof ApiError && err.status === 404) {
        toast.error(t("account.passwordChangeBackendRequired"));
      } else {
        toast.error(err instanceof ApiError ? err.message : t("account.passwordUpdateFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/users/${user.id}`);
      toast.success(t("account.accountDeleted"));
      logout();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t("account.selfDeleteNotEnabled"));
      } else {
        toast.error(err instanceof ApiError ? err.message : t("account.accountDeleteFailed"));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title={t("account.changePasswordTitle")}
        description={t("account.changePasswordDescription")}
        action={
          <Button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword}
            size="sm"
            className="rounded-full"
          >
            {saving ? tc("saving") : t("account.updatePassword")}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="current-pw"
              className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
            >
              {tp("currentPassword")}
            </Label>
            <Input
              id="current-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="new-pw"
                className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
              >
                {tp("newPassword")}
              </Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="confirm-pw"
                className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
              >
                {t("account.confirmNewPassword")}
              </Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="h-10 rounded-xl"
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("account.signOutEverywhere")}
        description={t("account.signOutEverywhereDescription")}
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full">
              <Lock className="mr-2 h-3.5 w-3.5" />
              {t("account.signOutEverywhere")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("account.signOutAllDevices")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("account.signOutAllDevicesDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await apiClient.delete("/sessions");
                    toast.success(t("account.signedOutAllDevices"));
                    logout();
                  } catch {
                    toast.error(t("account.signOutEverywhereFailed"));
                  }
                }}
              >
                {t("account.signOutEverywhere")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsSection>

      <SettingsSection
        title={tp("deleteAccount")}
        description={t("account.deleteAccountDescription")}
        danger
      >
        <div className="border-destructive/20 bg-destructive/[0.04] flex items-start gap-3 rounded-xl border p-4">
          <span className="bg-destructive/15 text-destructive flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-semibold">{t("account.thisIsIrreversible")}</p>
            <p className="text-foreground/65 mt-0.5 text-xs leading-relaxed">
              {t("account.deleteAccountDetails")}
            </p>
          </div>
        </div>
        <div className="mt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="rounded-full">
              {t("account.deleteMyAccount")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("account.deleteAccountConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("account.deleteAccountConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? t("account.deleting") : t("account.yesDeleteMyAccount")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </SettingsSection>
    </div>
  );
}
