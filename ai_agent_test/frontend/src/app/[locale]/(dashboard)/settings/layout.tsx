import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { PageHero } from "@/components/dashboard/page-hero";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("settings");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      <PageHero
        eyebrow={t("title")}
        title={t.rich("layout.title", { em: (chunks) => <em>{chunks}</em> })}
        description={t("layout.description")}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
