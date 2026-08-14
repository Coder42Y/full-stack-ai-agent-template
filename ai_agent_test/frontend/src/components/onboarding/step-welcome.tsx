"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Database, MessageSquare, Users } from "lucide-react";

import { useAuth } from "@/hooks";

import { OnboardingShell } from "./onboarding-shell";

const PERKS = [
  { icon: MessageSquare, titleKey: "perkAgentTitle", descriptionKey: "perkAgentDescription" },
  { icon: Database, titleKey: "perkDataTitle", descriptionKey: "perkDataDescription" },
  { icon: Users, titleKey: "perkTeamTitle", descriptionKey: "perkTeamDescription" },
];

export function StepWelcome() {
  const t = useTranslations("onboarding.welcome");
  const router = useRouter();
  const { user } = useAuth();

  return (
    <OnboardingShell
      step="welcome"
      title={
        user?.full_name
          ? t("titleWithName", { name: user.full_name.split(" ")[0] })
          : t("title")
      }
      description={t("description")}
    >
      <ul className="space-y-3">
        {PERKS.map((perk) => (
          <li
            key={perk.titleKey}
            className="border-foreground/10 bg-card flex items-start gap-4 rounded-2xl border p-5"
          >
            <div className="bg-brand/15 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <perk.icon className="text-foreground h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-foreground font-display text-base font-semibold">
                {t(perk.titleKey)}
              </p>
              <p className="text-foreground/65 mt-0.5 text-sm">{t(perk.descriptionKey)}</p>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => router.push("/onboarding/agent")}
        className="bg-foreground text-background hover:bg-foreground/90 mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors"
      >
        {t("letsGo")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </OnboardingShell>
  );
}
