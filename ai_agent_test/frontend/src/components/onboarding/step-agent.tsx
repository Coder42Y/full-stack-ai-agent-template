"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { OnboardingShell } from "./onboarding-shell";

const AGENT_IDS = ["pydantic_ai", "langgraph", "deepagents", "crewai"] as const;
const AGENT_NAMES: Record<(typeof AGENT_IDS)[number], string> = {
  pydantic_ai: "PydanticAI",
  langgraph: "LangGraph",
  deepagents: "DeepAgents",
  crewai: "CrewAI",
};
const RECOMMENDED_ID = "pydantic_ai";

export function StepAgent() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const [selected, setSelected] = useState<string>(() => RECOMMENDED_ID);

  const handleNext = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("onboarding.agent", selected);
    }
    router.push("/onboarding/data");
  };

  return (
    <OnboardingShell
      step="agent"
      title={t("agent.title")}
      description={t("agent.description")}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {AGENT_IDS.map((id) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={cn(
                "lift relative flex flex-col gap-2 rounded-2xl border p-5 text-left transition-colors",
                isSelected
                  ? "border-brand bg-brand/[0.06]"
                  : "border-foreground/10 bg-card hover:border-foreground/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-foreground font-display text-base font-semibold">
                    {AGENT_NAMES[id]}
                  </p>
                  <p className="text-foreground/55 text-xs">{t(`agent.options.${id}.tagline`)}</p>
                </div>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isSelected
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-foreground/25",
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
              </div>
              <p className="text-foreground/70 mt-1 text-sm leading-relaxed">
                {t(`agent.options.${id}.description`)}
              </p>
              {id === RECOMMENDED_ID && (
                <span className="bg-brand text-brand-foreground absolute -top-2 right-4 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase">
                  {t("agent.recommended")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleNext}
        className="bg-foreground text-background hover:bg-foreground/90 mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors"
      >
        {tc("continue")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </OnboardingShell>
  );
}
