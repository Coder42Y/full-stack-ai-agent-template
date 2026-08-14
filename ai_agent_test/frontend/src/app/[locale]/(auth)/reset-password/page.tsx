import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("auth.meta");
  return pageMetadata({
    title: t("resetTitle"),
    description: t("resetDescription"),
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
  const t = await getTranslations("auth.resetPassword");

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <span className="eyebrow text-foreground/55">{t("eyebrow")}</span>
          <h1 className="text-display-md text-foreground">{t("missingTitle")}</h1>
          <p className="text-foreground/70 text-sm">{t("missingBody")}</p>
        </div>
        <Link
          href="/forgot-password"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors"
        >
          {t("requestNewLink")}
        </Link>
        <p className="text-foreground/55 text-xs">
          {t.rich("orReturnToSignIn", {
            link: (chunks) => (
              <Link
                href={ROUTES.LOGIN}
                className="text-foreground hover:text-foreground/80 underline-offset-4 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
