"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Label } from "@/components/ui";
import { apiClient, ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

function strengthScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return score;
}

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const score = useMemo(() => strengthScore(password), [password]);
  const strengthLabel = useMemo(() => {
    if (!password) return "";
    if (score <= 1) return "较弱";
    if (score <= 2) return "一般";
    if (score <= 3) return "良好";
    return "较强";
  }, [score, password]);
  const matches = !confirm || password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("密码至少 8 个字符");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/auth/password-reset/confirm", {
        token,
        new_password: password,
      });
      toast.success("密码已更新，请重新登录。");
      router.push(ROUTES.LOGIN);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "重置链接无效或已过期。";
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
          重置密码
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          设置新密码
        </h1>
        <p className="text-foreground/65 text-sm">
          请设置 8 位以上密码，建议包含大小写字母和数字。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            disabled={submitting}
            className="h-10 rounded-md"
          />
          {password && (
            <div className="space-y-1.5 pt-1">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={Math.min(score, 4)}
                aria-label={strengthLabel}
                className="flex gap-1"
              >
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= score ? "bg-brand" : "bg-foreground/10"
                    }`}
                  />
                ))}
              </div>
              <p
                aria-live="polite"
                className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase"
              >
                {strengthLabel}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="confirm-pw"
            className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            确认密码
          </Label>
          <Input
            id="confirm-pw"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            disabled={submitting}
            className={`h-10 rounded-md ${confirm && !matches ? "border-destructive" : ""}`}
          />
          {confirm && !matches && (
            <p className="text-destructive inline-flex items-center gap-1 text-xs">
              <X className="h-3 w-3" />
              两次输入的密码不一致
            </p>
          )}
          {confirm && matches && (
            <p className="text-brand inline-flex items-center gap-1 text-xs">
              <Check className="h-3 w-3" />
              已匹配
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="h-10 w-full rounded-md bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
        >
          {submitting ? (
            "更新中..."
          ) : (
            <>
              更新密码
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <Link
          href={ROUTES.LOGIN}
          className="text-foreground/55 hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          返回登录
        </Link>
      </form>
    </div>
  );
}
