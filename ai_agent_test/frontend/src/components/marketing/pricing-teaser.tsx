"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

interface Plan {
  name: string;
  price: string;
  cadence?: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
  badge?: string;
}

interface PricingTeaserProps {
  plans: Plan[];
  fullPricingHref?: string;
}

export function PricingTeaser({ plans, fullPricingHref = "/pricing" }: PricingTeaserProps) {
  const t = useTranslations("marketing.landing.pricing.teaser");

  return (
    <div className="border-foreground/10 bg-foreground/[0.02] relative isolate overflow-hidden rounded-3xl border p-8 md:p-14">
      {/* Brand glow under the price */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-40 -z-10 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(from var(--color-brand) l c h / 0.3), transparent 65%)",
        }}
      />
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 -z-10 opacity-50" />

      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={cn(
              "border-foreground/15 bg-card flex min-h-[360px] flex-col rounded-2xl border p-6",
              plan.featured && "border-brand bg-brand/[0.08] shadow-2xl",
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-foreground/55">{plan.name}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-foreground font-mono text-4xl font-semibold">
                    {plan.price}
                  </span>
                  {plan.cadence && (
                    <span className="text-foreground/55 text-sm">{plan.cadence}</span>
                  )}
                </div>
              </div>
              {plan.badge && (
                <span className="bg-brand text-brand-foreground rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
                  {plan.badge}
                </span>
              )}
            </div>

            <p className="text-foreground/70 text-sm leading-relaxed">{plan.description}</p>

            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.slice(0, 4).map((feature) => (
                <li key={feature} className="text-foreground/85 flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href={plan.cta.href}
              className="bg-foreground text-background hover:bg-foreground/90 group mt-8 inline-flex items-center justify-between gap-3 rounded-full py-2 pr-2 pl-5 text-sm font-medium transition-colors"
            >
              <span>{plan.cta.label}</span>
              <span className="bg-brand text-brand-foreground flex h-9 w-9 items-center justify-center rounded-full transition-transform group-hover:rotate-45">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link
          href={fullPricingHref}
          className="text-foreground/65 hover:text-foreground border-foreground/15 hover:border-foreground/40 inline-flex items-center gap-2 border-b pb-1 text-sm font-medium transition-colors"
        >
          {t("seeFull")}
        </Link>
      </div>
    </div>
  );
}
