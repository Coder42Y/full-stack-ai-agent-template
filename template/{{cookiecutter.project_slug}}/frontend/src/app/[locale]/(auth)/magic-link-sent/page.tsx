{% raw %}import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

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
    title: "检查邮箱",
    description: "我们已发送登录链接。",
    path: "/magic-link-sent",
    locale,
    noindex: true,
  });
}

interface PageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function MagicLinkSentPage({ searchParams }: PageProps) {
  const { email } = await searchParams;

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-foreground/10 bg-foreground/[0.04]">
        <Mail className="text-foreground h-7 w-7" />
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/50">
          邮箱登录
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          登录链接已发送
        </h1>
        <p className="text-foreground/70 text-sm">
          我们已发送登录链接
          {email ? (
            <>
              到 <span className="text-foreground font-medium">{email}</span>
            </>
          ) : null}
          。请在 15 分钟内打开链接继续。
        </p>
      </div>

      <div className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-left">
        <p className="text-foreground/70 text-xs leading-relaxed">
          没收到邮件？请检查垃圾邮件，或{" "}
          <Link
            href={ROUTES.LOGIN}
            className="text-foreground hover:text-foreground/80 font-medium underline-offset-4 hover:underline"
          >
            重新发送
          </Link>
          。
        </p>
      </div>

      <Link
        href={ROUTES.LOGIN}
        className="text-foreground/55 hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
      >
        <ArrowLeft className="h-4 w-4" />
        返回登录
      </Link>
    </div>
  );
}
{% endraw %}
