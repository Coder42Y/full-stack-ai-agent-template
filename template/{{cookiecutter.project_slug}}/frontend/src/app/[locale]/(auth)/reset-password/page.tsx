import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { Locale } from "@/i18n";
import { ROUTES } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({
    title: "设置新密码",
    description: "重置账号登录密码。",
    path: "/reset-password",
    locale,
    noindex: true,
  });
}

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
            重置密码
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            链接缺失或已过期
          </h1>
          <p className="text-foreground/70 text-sm">
            当前页面需要邮箱中的重置令牌。请重新申请链接后继续。
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          重新申请链接
        </Link>
        <p className="text-foreground/55 text-xs">
          或{" "}
          <Link
            href={ROUTES.LOGIN}
            className="text-foreground hover:text-foreground/80 underline-offset-4 hover:underline"
          >
            返回登录
          </Link>
          。
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
