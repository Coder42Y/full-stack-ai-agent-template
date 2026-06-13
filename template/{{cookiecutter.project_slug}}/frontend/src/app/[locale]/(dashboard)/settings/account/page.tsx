"use client";

import { useState } from "react";
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
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("新密码至少需要 8 个字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/auth/password/change", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("密码已更新");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      // Backend may not have this endpoint yet — surface a helpful message.
      if (err instanceof ApiError && err.status === 404) {
        toast.error("修改密码接口尚未接入（POST /auth/password/change）。");
      } else {
        toast.error(err instanceof ApiError ? err.message : "更新密码失败");
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
      toast.success("账号已删除");
      logout();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error("当前未启用自助删除账号。");
      } else {
        toast.error(err instanceof ApiError ? err.message : "删除账号失败");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="修改密码"
        description="使用至少 8 个字符的强密码。MVP 演示环境下该能力依赖后端接口接入。"
        action={
          <Button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword}
            size="sm"
            className="rounded-full"
          >
            {saving ? "保存中..." : "更新密码"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="current-pw"
              className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
            >
              当前密码
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
                新密码
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
                确认新密码
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
        title="退出所有设备"
        description="撤销所有活跃会话，包括当前设备。"
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full">
              <Lock className="mr-2 h-3.5 w-3.5" />
              退出所有设备
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认退出所有设备？</AlertDialogTitle>
              <AlertDialogDescription>
                这会撤销所有活跃会话，并立即退出当前设备。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await apiClient.delete("/sessions");
                    toast.success("已退出所有设备");
                    logout();
                  } catch {
                    toast.error("退出所有设备失败");
                  }
                }}
              >
                退出所有设备
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsSection>

      <SettingsSection
        title="删除账号"
        description="永久删除账号、对话和上传数据。该操作无法撤销。"
        danger
      >
        <div className="border-destructive/20 bg-destructive/[0.04] flex items-start gap-3 rounded-xl border p-4">
          <span className="bg-destructive/15 text-destructive flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-semibold">该操作无法撤销</p>
            <p className="text-foreground/65 mt-0.5 text-xs leading-relaxed">
              所有对话、需求知识库内容和个人数据都会被永久删除。
            </p>
          </div>
        </div>
        <div className="mt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="rounded-full">
              删除我的账号
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除账号？</AlertDialogTitle>
              <AlertDialogDescription>
                你的对话、需求知识库内容和个人数据会被永久删除。该操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "删除中..." : "确认删除账号"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </SettingsSection>
    </div>
  );
}
