/**
 * Hardcoded teaser plans used as a fallback when the Stripe-driven
 * `/billing/plans` endpoint returns an empty list — so the marketing surface
 * stays consistent regardless of backend state.
 *
 * Shape mirrors the simplified one used by `<PricingTeaser />` on the landing
 * page. The full /pricing page maps these into its own card UI.
 *
 * Replace these copy strings via the i18n `marketing.pricing.plans.*` keys
 * once you localize for additional languages.
 */
import { ROUTES } from "@/lib/constants";

export interface TeaserPlan {
  name: string;
  /** Display price, currency-prefixed (e.g. "$0", "$29"). Leave empty for "Custom". */
  price: string;
  /** Cadence label shown next to price (e.g. "/ month", "/ user / month"). */
  cadence?: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
  badge?: string;
}

export const TEASER_PLANS: TeaserPlan[] = [
  {
    name: "MVP Demo",
    price: "4",
    cadence: " core scenarios",
    description: "The smallest business loop needed for the interview demo.",
    features: ["Vehicle pile-up detection", "Peak-hour trend analysis", "Forecast gap ranking"],
    cta: { label: "Open chat", href: ROUTES.CHAT },
  },
  {
    name: "Ops Pilot",
    price: "18",
    cadence: " Shanghai stations",
    description: "A seeded operations pilot with realistic demo data.",
    features: [
      "PostgreSQL business tables",
      "MCP query tools",
      "ECharts rendering",
      "Three business prompts",
    ],
    cta: { label: "Open workspace", href: ROUTES.DASHBOARD },
    featured: true,
    badge: "Current build",
  },
  {
    name: "Production",
    price: "Extensible",
    description: "Add spatial calculation and dispatch constraints for real deployment.",
    features: [
      "PostGIS distance weights",
      "Capacity and vehicle constraints",
      "Realtime data sync",
      "Configurable thresholds",
    ],
    cta: { label: "View plan", href: "/contact" },
  },
];

/** Chinese demo plans. Returned by helpers when locale=zh. */
export const TEASER_PLANS_ZH: TeaserPlan[] = [
  {
    name: "MVP Demo",
    price: "4",
    cadence: " 个核心场景",
    description: "面试演示所需的最小业务闭环。",
    features: ["车辆堆积识别", "早晚高峰趋势", "预测缺口排序"],
    cta: { label: "打开聊天", href: ROUTES.CHAT },
  },
  {
    name: "Ops Pilot",
    price: "18",
    cadence: " 个站点",
    description: "带真实 seed 数据的运营试跑版本。",
    features: ["PostgreSQL 业务库", "MCP 查询工具", "ECharts 图表渲染", "三套业务 Prompt"],
    cta: { label: "进入工作台", href: ROUTES.DASHBOARD },
    featured: true,
    badge: "当前版本",
  },
  {
    name: "Production",
    price: "可扩展",
    description: "真实落地时加入空间计算和调度约束。",
    features: ["PostGIS 距离权重", "容量和车型约束", "实时数据同步", "阈值配置中心"],
    cta: { label: "查看方案", href: "/contact" },
  },
];

export function getTeaserPlans(locale: string): TeaserPlan[] {
  return locale === "zh" ? TEASER_PLANS_ZH : TEASER_PLANS;
}
