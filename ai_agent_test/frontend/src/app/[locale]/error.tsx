"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold tracking-wider text-red-500 uppercase">
        {t("common.error")}
      </p>
      <h1 className="text-foreground mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {t("errors.generic")}
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md">{t("errors.pageLoadError")}</p>
      {error.digest && (
        <p className="text-muted-foreground/60 mt-1 text-xs">
          {t("errors.errorId", { id: error.digest })}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {t("common.retry")}
        </button>
        <Link
          href="/"
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {t("common.goHome")}
        </Link>
      </div>
    </div>
  );
}
