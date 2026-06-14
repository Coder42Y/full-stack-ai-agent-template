"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";

import { OAuthButtons, OAuthDivider } from "@/components/auth/oauth-buttons";
import { Button, Input, Label } from "@/components/ui";
import { useAuth } from "@/hooks";
import { ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: "较弱", color: "bg-destructive" };
  if (score <= 2) return { score: 2, label: "一般", color: "bg-orange-500" };
  if (score <= 3) return { score: 3, label: "良好", color: "bg-yellow-500" };
  return { score: 4, label: "较强", color: "bg-brand" };
}

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const emailValid = !email || EMAIL_RE.test(email);
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const passwordLongEnough = !password || password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!EMAIL_RE.test(email)) {
      setError("请输入有效邮箱地址");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 个字符");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      toast.error("两次输入的密码不一致");
      return;
    }

    setIsLoading(true);
    try {
      await register({ email, password, full_name: name || undefined });
      toast.success("账号创建成功");
      router.push(ROUTES.LOGIN + "?registered=true");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "注册失败，请重试。";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
          创建演示账号
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          创建需求工作台账号
        </h1>
        <p className="text-foreground/65 text-sm">
          已有账号？{" "}
          <Link
            href={ROUTES.LOGIN}
            className="text-foreground hover:text-foreground/80 font-medium underline-offset-4 hover:underline"
          >
            登录
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label
            htmlFor="name"
            className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            姓名（可选）
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="希望如何称呼你？"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            autoComplete="name"
            className="h-10 rounded-md"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            邮箱
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            required
            disabled={isLoading}
            autoComplete="email"
            className={`h-10 rounded-md ${emailTouched && email && !emailValid ? "border-destructive" : ""}`}
          />
          {emailTouched && email && !emailValid && (
            <p className="text-destructive text-xs">请输入有效邮箱地址</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="password"
            className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            密码
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="至少 8 个字符"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            className={`h-10 rounded-md ${password && !passwordLongEnough ? "border-destructive" : ""}`}
          />
          {password && (
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= strength.score ? strength.color : "bg-foreground/10"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase">
                  {strength.label}
                </p>
                <div className="flex items-center gap-1.5 text-xs">
                  {password.length >= 8 ? (
                    <span className="text-brand inline-flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      8+ 字符
                    </span>
                  ) : (
                    <span className="text-foreground/55 inline-flex items-center gap-1">
                      <X className="h-3 w-3" />
                      8+ 字符
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="confirmPassword"
            className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            确认密码
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="再次输入密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            className={`h-10 rounded-md ${confirmPassword && !passwordsMatch ? "border-destructive" : ""}`}
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-destructive inline-flex items-center gap-1 text-xs">
              <X className="h-3 w-3" />
              两次输入的密码不一致
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
          disabled={isLoading}
          className="h-10 w-full rounded-md bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
        >
          {isLoading ? (
            "创建中..."
          ) : (
            <>
              注册
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-foreground/50 text-center text-xs">
          创建账号即表示你同意我们的{" "}
          <Link
            href="/legal/terms"
            className="text-foreground/70 hover:text-foreground underline-offset-4 hover:underline"
          >
            服务条款
          </Link>{" "}
          和{" "}
          <Link
            href="/legal/privacy"
            className="text-foreground/70 hover:text-foreground underline-offset-4 hover:underline"
          >
            隐私政策
          </Link>
          。
        </p>
      </form>

      <OAuthBlock label="或使用以下方式注册" />
    </div>
  );
}

function OAuthBlock({ label }: { label: string }) {
  if (!process.env.NEXT_PUBLIC_OAUTH_PROVIDERS) return null;
  return (
    <div className="space-y-5">
      <OAuthDivider label={label} />
      <OAuthButtons variant="signup" />
    </div>
  );
}
