"use client";

import { useTranslations } from "next-intl";

import { InvoicesPanel } from "@/components/billing";
import { PageHero } from "@/components/dashboard/page-hero";

export default function InvoicesPage() {
  const t = useTranslations("billing");
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHero
        eyebrow={t("eyebrowInvoices")}
        title={
          <>
            {t("billingHistoryPrefix")} <em>{t("billingHistoryEm")}</em>
          </>
        }
        description={t("billingHistoryDesc")}
      />
      <InvoicesPanel />
    </div>
  );
}
