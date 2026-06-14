"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import { OAuthButtons, OAuthDivider } from "@/components/auth/oauth-buttons";
import { Button, Input, Label } from "@/components/ui";
import { useAuth } from "@/hooks";
import { ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const emailValid = !email || EMAIL_RE.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await login({ email, password });
      toast.success("登录成功");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "登录失败，请重试。";
      setError(message);
      toast.error(message);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
          欢迎回来
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          登录到需求工作台
        </h1>
        <p className="text-foreground/65 text-sm">
          还没有账号？{" "}
          <Link
            href={ROUTES.REGISTER}
            className="text-foreground hover:text-foreground/80 font-medium underline-offset-4 hover:underline"
          >
            注册
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
          <div className="flex items-center justify-between">
            <Label
              htmlFor="password"
              className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
            >
              密码
            </Label>
            <Link
              href="/forgot-password"
              className="text-foreground/55 hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
            >
              忘记？
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="current-password"
            className="h-10 rounded-md"
          />
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
            "登录中..."
          ) : (
            <>
              登录
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <OAuthBlock label="或使用以下方式登录" />
    </div>
  );
}

function OAuthBlock({ label }: { label: string }) {
  if (!process.env.NEXT_PUBLIC_OAUTH_PROVIDERS) return null;
  return (
    <div className="space-y-5">
      <OAuthDivider label={label} />
      <OAuthButtons />
    </div>
  );
}
