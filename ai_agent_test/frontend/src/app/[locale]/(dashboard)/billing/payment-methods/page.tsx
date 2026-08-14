"use client";

import { useTranslations } from "next-intl";

import { PaymentMethodsPanel } from "@/components/billing";
import { PageHero } from "@/components/dashboard/page-hero";

export default function PaymentMethodsPage() {
  const t = useTranslations("billing");
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHero
        eyebrow={t("eyebrowPaymentMethods")}
        title={
          <>
            {t("cardsOnFilePrefix")} <em>{t("cardsOnFileEm")}</em>
          </>
        }
        description={t("cardsOnFileDesc")}
      />
      <PaymentMethodsPanel />
    </div>
  );
}
