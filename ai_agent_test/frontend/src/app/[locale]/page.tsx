import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BarChart3, Database, MessageSquare, Sparkles, Wrench } from "lucide-react";

import type { Locale } from "@/i18n";
import { pageMetadata } from "@/lib/seo";

import { DataFlowDiagram } from "@/components/marketing/data-flow-diagram";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { FeatureMockup } from "@/components/marketing/feature-mockup";
import { FeatureSection } from "@/components/marketing/feature-section";
import { FinalCta } from "@/components/marketing/final-cta";
import {
  buildFooterColumns,
  buildFooterLegal,
  buildMarketingNavLinks,
} from "@/components/marketing/footer-config";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LogosStrip } from "@/components/marketing/logos-strip";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Marquee } from "@/components/marketing/marquee";
import { PillNav } from "@/components/marketing/pill-nav";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { TestimonialGrid } from "@/components/marketing/testimonial-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { faqSchema, organizationSchema, websiteSchema } from "@/lib/schema-org";

type LandingFeature = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  bullets: { title: string; body: string }[];
  cta: string;
};

type LandingCopy = {
  logos: string[];
  marquee: string[];
  heroDemo: {
    script: Array<{ role: "user" | "tool" | "agent"; text: string }>;
    placeholder: string;
    floatingPills: Array<{
      icon: typeof MessageSquare;
      label: string;
      className: string;
    }>;
  };
  howTitle: ReactNode;
  howSteps: Array<{
    icon: typeof MessageSquare;
    title: string;
    body: string;
  }>;
  features: [LandingFeature, LandingFeature, LandingFeature];
  dataTitle: ReactNode;
  dataDescription: string;
  dataFlow: {
    sourcesEyebrow: string;
    sources: string[];
    rowsLabel: string;
    readyLabel: string;
    question: string;
    answerEyebrow: string;
    answer: string;
  };
  mockup: {
    agentQuery: string;
    agentAnswer: string;
    agentPlaceholder: string;
    ragSearch: string;
    ragResults: Array<{ title: string; snippet: string; score: number }>;
    operationsLabel: string;
    ordersLabel: string;
    metricStations: string;
    metricAnomaly: string;
    metricForecast: string;
  };
  testimonials: Array<{ quote: string; name: string; title: string; company: string }>;
  plans: Array<{
    name: string;
    price: string;
    cadence?: string;
    description: string;
    features: string[];
    cta: { label: string; href: string };
    featured?: boolean;
    badge?: string;
  }>;
};

const LANDING_COPY = {
  zh: {
    logos: ["车辆分布", "订单流水", "天气观测", "需求预测", "站点档案", "调度策略"],
    marquee: [
      "车辆堆积",
      "缺车预测",
      "早高峰",
      "晚高峰",
      "暴雨应急",
      "站点容量",
      "区域对比",
      "订单趋势",
      "调度建议",
      "SQL 依据",
      "ECharts",
      "MCP 工具",
      "浦东新区",
      "徐家汇",
      "虹桥枢纽",
      "张江地铁站",
    ],
    heroDemo: {
      script: [
        {
          role: "user",
          text: "哪些站点存在车辆堆积？给我 SQL 依据和调度建议。",
        },
        {
          role: "tool",
          text: "mcp_execute_query · vehicle_distribution · 4 rows",
        },
        {
          role: "agent",
          text: "发现 4 个堆积站点：虹桥火车站、张江地铁站、陆家嘴、徐家汇商圈。建议优先处理虹桥和张江，并在 2 小时后复查库存变化。",
        },
      ],
      placeholder: "询问车辆、订单或需求预测…",
      floatingPills: [
        {
          icon: MessageSquare,
          label: "自然语言查数",
          className: "left-[-12px] top-12 md:left-[-32px] md:top-16 float-y",
        },
        {
          icon: Database,
          label: "连接运营数据库",
          className: "right-[-8px] top-24 md:right-[-40px] md:top-28 float-y-delayed",
        },
        {
          icon: Wrench,
          label: "MCP 工具调用",
          className: "left-[8%] bottom-[-18px] md:left-[12%] md:bottom-[-24px] float-y-delayed",
        },
        {
          icon: Sparkles,
          label: "图表与建议",
          className: "right-[10%] bottom-[-12px] md:right-[12%] md:bottom-[-20px] float-y",
        },
      ],
    },
    howTitle: (
      <>
        先查数据，再看图表，最后形成<em>调度动作。</em>
      </>
    ),
    howSteps: [
      {
        icon: MessageSquare,
        title: "提出运营问题",
        body: "直接用中文询问车辆堆积、早晚高峰订单趋势、预测缺口或天气应急，不需要手写 SQL。",
      },
      {
        icon: Database,
        title: "Agent 查询数据",
        body: "通过 MCP 读取车辆分布、订单流水、站点、天气和需求预测表，并返回可复查的查询依据。",
      },
      {
        icon: BarChart3,
        title: "生成调度建议",
        body: "把异常站点、峰值趋势和缺车优先级整理成图表、排序结果和下一步调度动作。",
      },
    ],
    features: [
      {
        eyebrow: "运营数据库",
        title: (
          <>
            车辆、订单、天气、预测，<em>统一查询。</em>
          </>
        ),
        description:
          "内置上海共享出行样例数据。Agent 通过只读 MCP SQL 工具查询站点、车辆分布、订单、天气和需求预测。",
        bullets: [
          {
            title: "只读 SQL 安全层",
            body: "只允许 SELECT/WITH，限制白名单表，并自动追加查询行数上限。",
          },
          {
            title: "业务口径进 Prompt",
            body: "堆积阈值、早晚高峰和缺车计算口径直接进入系统提示词。",
          },
          {
            title: "SQL 结果可展开",
            body: "前端把查询依据渲染成表格，方便面试时解释数据来源。",
          },
        ],
        cta: "查看知识库",
      },
      {
        eyebrow: "智能分析",
        title: (
          <>
            从一句中文问题到<em>运营结论。</em>
          </>
        ),
        description:
          "你可以直接问“哪些站点堆积”“最近一周早晚高峰趋势”“按缺口给调度优先级”。Agent 会查数、画图并解释建议。",
        bullets: [
          {
            title: "自动选择工具",
            body: "需要数据时调用 PostgreSQL，需要趋势和对比时调用 ECharts。",
          },
          {
            title: "三种业务模式",
            body: "巡检、分析、应急三套 Prompt 已 seeded 到数据库。",
          },
          {
            title: "前端专用渲染",
            body: "SQL 表格和 ECharts 不再以原始 JSON 展示。",
          },
        ],
        cta: "开始分析",
      },
      {
        eyebrow: "运营闭环",
        title: (
          <>
            不止回答问题，也给出<em>下一步动作。</em>
          </>
        ),
        description:
          "MVP 先按预测缺口排序给出调度优先级；生产环境可扩展距离、容量、车型和实时约束。",
        bullets: [
          {
            title: "异常先识别",
            body: "车辆超过阈值且长时间未移动时，优先标出异常站点。",
          },
          {
            title: "建议能落到站点",
            body: "回答会尽量给出站点、区域、数量和复查时间点。",
          },
          {
            title: "架构可继续扩展",
            body: "MCP server 可以继续挂接实时调度、工单和告警系统。",
          },
        ],
        cta: "查看运营看板",
      },
    ],
    dataTitle: (
      <>
        PostgreSQL 查数，MCP 编排，<em>前端可视化。</em>
      </>
    ),
    dataDescription:
      "运营问题先进入 Agent，Agent 选择 SQL 或图表工具，结果以表格和 ECharts 回到对话，方便解释和复盘。",
    dataFlow: {
      sourcesEyebrow: "运营数据",
      sources: ["车辆分布", "订单流水", "天气观测", "需求预测", "站点档案"],
      rowsLabel: "demo rows",
      readyLabel: "MCP ready",
      question: "哪些站点存在车辆堆积？",
      answerEyebrow: "建议",
      answer: "发现 4 个车辆堆积站点，优先处理虹桥火车站和张江地铁站，并在 2 小时后复查库存变化。",
    },
    mockup: {
      agentQuery: "分析浦东新区缺车站点。",
      agentAnswer: "张江地铁站、龙阳路交通枢纽、世纪大道未来 3 小时缺口最高，建议优先补车。",
      agentPlaceholder: "询问车辆、订单或天气...",
      ragSearch: "暴雨 堆积 调度",
      ragResults: [
        {
          title: "暴雨天气调度预案.md",
          snippet: "...heavy_rain 时优先保障地铁站、交通枢纽和商业区周边车辆供给...",
          score: 0.94,
        },
        {
          title: "共享单车早晚高峰规则.pdf",
          snippet: "...早高峰 7-9 点，晚高峰 17-19 点，按站点订单量和预测缺口排序...",
          score: 0.87,
        },
        {
          title: "车辆堆积处理 SOP.docx",
          snippet: "...total_count 超过阈值且 24 小时未移动时，触发巡检和清运建议...",
          score: 0.82,
        },
      ],
      operationsLabel: "Operations today",
      ordersLabel: "30 天订单样本",
      metricStations: "Stations",
      metricAnomaly: "Anomaly",
      metricForecast: "Forecast",
    },
    testimonials: [
      {
        quote:
          "我不需要先找报表再写 SQL，直接问哪些站点堆积，Agent 会把口径、数据和建议一起给出来。",
        name: "上海区域运营",
        title: "早班巡检",
        company: "共享单车团队",
      },
      {
        quote: "早晚高峰趋势能直接生成图表，面试 Demo 看起来像业务系统，而不是又一个聊天机器人。",
        name: "数据分析师",
        title: "运营复盘",
        company: "城市出行平台",
      },
      {
        quote:
          "缺车建议先按预测缺口排序，简单但清楚。后续要加距离和容量权重也能沿着 SQL 模板扩展。",
        name: "调度负责人",
        title: "晚高峰保障",
        company: "两轮车运营组",
      },
    ],
    plans: [
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
        cadence: " 个上海站点",
        description: "带真实 seed 数据的运营试跑版本。",
        features: ["PostgreSQL 业务库", "MCP 查询工具", "ECharts 图表渲染", "三套业务 Prompt"],
        cta: { label: "进入工作台", href: ROUTES.DASHBOARD },
        featured: true,
        badge: "当前版本",
      },
      {
        name: "Production",
        price: "可扩展",
        description: "真实落地时再加入空间计算和调度约束。",
        features: ["PostGIS 距离权重", "容量和车型约束", "实时数据同步", "阈值配置中心"],
        cta: { label: "查看方案", href: "/contact" },
      },
    ],
  },
  en: {
    logos: [
      "Vehicle distribution",
      "Order stream",
      "Weather signals",
      "Demand forecast",
      "Station profile",
      "Dispatch policy",
    ],
    marquee: [
      "Vehicle pile-up",
      "Shortage forecast",
      "Morning peak",
      "Evening peak",
      "Heavy rain response",
      "Station capacity",
      "District comparison",
      "Order trend",
      "Dispatch suggestion",
      "SQL evidence",
      "ECharts",
      "MCP tools",
      "Pudong",
      "Xujiahui",
      "Hongqiao hub",
      "Zhangjiang station",
    ],
    heroDemo: {
      script: [
        {
          role: "user",
          text: "Which stations have vehicle pile-up? Show SQL evidence and dispatch suggestions.",
        },
        {
          role: "tool",
          text: "mcp_execute_query · vehicle_distribution · 4 rows",
        },
        {
          role: "agent",
          text: "Found 4 pile-up stations: Hongqiao Railway Station, Zhangjiang Metro, Lujiazui, and Xujiahui. Prioritize Hongqiao and Zhangjiang, then recheck inventory in 2 hours.",
        },
      ],
      placeholder: "Ask about vehicles, orders, or demand forecasts…",
      floatingPills: [
        {
          icon: MessageSquare,
          label: "Natural-language SQL",
          className: "left-[-12px] top-12 md:left-[-32px] md:top-16 float-y",
        },
        {
          icon: Database,
          label: "Operations database",
          className: "right-[-8px] top-24 md:right-[-40px] md:top-28 float-y-delayed",
        },
        {
          icon: Wrench,
          label: "MCP tool calls",
          className: "left-[8%] bottom-[-18px] md:left-[12%] md:bottom-[-24px] float-y-delayed",
        },
        {
          icon: Sparkles,
          label: "Charts and actions",
          className: "right-[10%] bottom-[-12px] md:right-[12%] md:bottom-[-20px] float-y",
        },
      ],
    },
    howTitle: (
      <>
        Query data, inspect charts, then produce <em>dispatch actions.</em>
      </>
    ),
    howSteps: [
      {
        icon: MessageSquare,
        title: "Ask an operations question",
        body: "Ask about vehicle pile-ups, peak-hour order trends, predicted shortages, or weather response without writing SQL.",
      },
      {
        icon: Database,
        title: "Agent queries data",
        body: "MCP tools read vehicle distribution, orders, stations, weather, and demand forecasts, then return auditable query evidence.",
      },
      {
        icon: BarChart3,
        title: "Produce dispatch actions",
        body: "The agent turns anomalies, peak trends, and shortage priorities into charts, ranked results, and next actions.",
      },
    ],
    features: [
      {
        eyebrow: "Operations database",
        title: (
          <>
            Vehicles, orders, weather, and forecasts in <em>one query path.</em>
          </>
        ),
        description:
          "Seeded Shanghai shared mobility data lets the agent query stations, vehicle distribution, orders, weather, and demand forecasts through a read-only MCP SQL tool.",
        bullets: [
          {
            title: "Read-only SQL safety layer",
            body: "Only SELECT/WITH queries are allowed, tables are allow-listed, and result limits are enforced.",
          },
          {
            title: "Business thresholds in the prompt",
            body: "Pile-up thresholds, peak-hour windows, and shortage logic are injected into the agent instructions.",
          },
          {
            title: "SQL evidence in the UI",
            body: "The frontend renders query results as tables, so demo reviewers can inspect the source data.",
          },
        ],
        cta: "View knowledge base",
      },
      {
        eyebrow: "AI analysis",
        title: (
          <>
            From one operations question to an <em>actionable answer.</em>
          </>
        ),
        description:
          "Ask which stations are piling up, how peak-hour orders changed, or which shortages to dispatch first. The agent queries, charts, and explains the recommendation.",
        bullets: [
          {
            title: "Automatic tool choice",
            body: "The agent calls PostgreSQL for data and ECharts when a trend or comparison should be visualized.",
          },
          {
            title: "Three business prompt modes",
            body: "Inspection, analysis, and emergency response prompts are seeded into the database.",
          },
          {
            title: "Frontend-native rendering",
            body: "SQL tables and ECharts specs are displayed as usable UI instead of raw JSON.",
          },
        ],
        cta: "Start analysis",
      },
      {
        eyebrow: "Operations loop",
        title: (
          <>
            Not just answers. Clear <em>next actions.</em>
          </>
        ),
        description:
          "The MVP ranks dispatch priorities by predicted shortage first. Production can add distance, capacity, vehicle type, and live constraints.",
        bullets: [
          {
            title: "Detect anomalies first",
            body: "Stations over the vehicle threshold and stale for too long are surfaced as priority risks.",
          },
          {
            title: "Recommendations map to stations",
            body: "Answers include station, district, quantity, and suggested follow-up timing where possible.",
          },
          {
            title: "Extensible architecture",
            body: "The MCP server can later connect dispatch jobs, alerts, and real-time operations systems.",
          },
        ],
        cta: "View dashboard",
      },
    ],
    dataTitle: (
      <>
        PostgreSQL queries, MCP orchestration, <em>frontend visualization.</em>
      </>
    ),
    dataDescription:
      "The agent turns an operations question into SQL or chart tool calls. Tables and ECharts return to the conversation for inspection and review.",
    dataFlow: {
      sourcesEyebrow: "Operations data",
      sources: [
        "Vehicle distribution",
        "Order stream",
        "Weather signals",
        "Demand forecast",
        "Station profiles",
      ],
      rowsLabel: "demo rows",
      readyLabel: "MCP ready",
      question: "Which stations have vehicle pile-up?",
      answerEyebrow: "Action",
      answer:
        "Found 4 vehicle pile-up stations. Prioritize Hongqiao Railway Station and Zhangjiang Metro, then recheck inventory in 2 hours.",
    },
    mockup: {
      agentQuery: "Analyze shortage stations in Pudong.",
      agentAnswer:
        "Zhangjiang Metro, Longyang Road hub, and Century Avenue have the highest 3-hour gaps. Prioritize replenishment there.",
      agentPlaceholder: "Ask about vehicles, orders, or weather...",
      ragSearch: "heavy rain pile-up dispatch",
      ragResults: [
        {
          title: "heavy-rain-dispatch-plan.md",
          snippet:
            "...during heavy_rain, protect metro stations, transport hubs, and commercial areas first...",
          score: 0.94,
        },
        {
          title: "shared-bike-peak-hour-rules.pdf",
          snippet:
            "...morning peak 7-9, evening peak 17-19, sorted by station orders and predicted gap...",
          score: 0.87,
        },
        {
          title: "vehicle-pile-up-sop.docx",
          snippet:
            "...when total_count exceeds the threshold and remains stale for 24 hours, trigger inspection...",
          score: 0.82,
        },
      ],
      operationsLabel: "Operations today",
      ordersLabel: "30-day order sample",
      metricStations: "Stations",
      metricAnomaly: "Anomaly",
      metricForecast: "Forecast",
    },
    testimonials: [
      {
        quote:
          "Instead of hunting through dashboards and writing SQL, I can ask which stations are piling up and get the data, threshold, and recommendation together.",
        name: "Shanghai Ops Lead",
        title: "Morning inspection",
        company: "Bike sharing team",
      },
      {
        quote:
          "Peak-hour trends render as charts right inside the demo, so it feels like an operations product instead of another chatbot.",
        name: "Data Analyst",
        title: "Operations review",
        company: "Urban mobility platform",
      },
      {
        quote:
          "Shortage suggestions are ranked by predicted gap first. Simple enough for the MVP, and easy to extend with distance and capacity weights later.",
        name: "Dispatch Manager",
        title: "Evening peak coverage",
        company: "Two-wheel operations",
      },
    ],
    plans: [
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
    ],
  },
} satisfies Record<Locale, LandingCopy>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.landing" });
  return pageMetadata({
    title: APP_NAME,
    description: t("metaDescription"),
    path: "/",
    locale,
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.landing" });
  const tNav = await getTranslations({ locale, namespace: "marketing" });
  const copy = LANDING_COPY[locale];

  const navLinks = buildMarketingNavLinks((k) => tNav(k));
  const footerColumns = buildFooterColumns((k) => tNav(k));
  const footerLegal = buildFooterLegal((k) => tNav(k));
  const [databaseFeature, analysisFeature, loopFeature] = copy.features;

  const heroStats = [
    { value: "5", label: t("hero.stat_teams") },
    { value: "18", label: t("hero.stat_speed") },
    { value: "2", label: t("hero.stat_uptime") },
  ];
  const faqItems = t.raw("faq.items") as { q: string; a: string }[];

  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema(), faqSchema(faqItems)]} />

      <PillNav
        brand={APP_NAME}
        links={navLinks}
        ctaLabel={tNav("nav.getStarted")}
        ctaHref={ROUTES.REGISTER}
        secondaryCta={{ label: tNav("nav.signIn"), href: ROUTES.LOGIN }}
      />

      <main id="main">
        {/* Hero (dark) */}
        <Hero
          eyebrow={t("hero.eyebrow")}
          title={
            <>
              {t("hero.titlePre")} <em>{t("hero.titleHighlight")}</em> <em>{t("hero.titleEm")}</em>
            </>
          }
          description={t("hero.description")}
          primaryCta={{ label: t("hero.ctaPrimary"), href: ROUTES.REGISTER }}
          stats={heroStats}
          demoScript={copy.heroDemo.script}
          demoPlaceholder={copy.heroDemo.placeholder}
          floatingPills={copy.heroDemo.floatingPills}
          theme="dark"
        />

        {/* Marquee */}
        <Marquee items={copy.marquee} />

        {/* Social proof (light) */}
        <Section theme="light" padding="py-16 md:py-20">
          <Reveal>
            <LogosStrip label={t("social.title")} logos={copy.logos.map((name) => ({ name }))} />
          </Reveal>
        </Section>

        {/* How it works (dark) */}
        <Section theme="dark" id="how">
          <div className="mb-14 max-w-2xl">
            <div className="mb-5">
              <span className="eyebrow-badge">{t("how.eyebrow")}</span>
            </div>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              {copy.howTitle}
            </h2>
          </div>
          <Reveal>
            <HowItWorks steps={copy.howSteps} />
          </Reveal>
        </Section>

        {/* Features — alternating */}
        <Section theme="dark" id="features">
          <Reveal>
            <FeatureSection
              eyebrow={databaseFeature.eyebrow}
              title={databaseFeature.title}
              description={databaseFeature.description}
              bullets={databaseFeature.bullets}
              visual={<FeatureMockup kind="rag" copy={copy.mockup} />}
              cta={{ label: databaseFeature.cta, href: ROUTES.KB }}
              visualSide="left"
            />
          </Reveal>
        </Section>

        <Section theme="light">
          <Reveal>
            <FeatureSection
              eyebrow={analysisFeature.eyebrow}
              title={analysisFeature.title}
              description={analysisFeature.description}
              bullets={analysisFeature.bullets}
              visual={<FeatureMockup kind="agents" copy={copy.mockup} />}
              cta={{ label: analysisFeature.cta, href: ROUTES.CHAT }}
              visualSide="right"
            />
          </Reveal>
        </Section>

        <Section theme="dark">
          <Reveal>
            <FeatureSection
              eyebrow={loopFeature.eyebrow}
              title={loopFeature.title}
              description={loopFeature.description}
              bullets={loopFeature.bullets}
              visual={<FeatureMockup kind="billing" copy={copy.mockup} />}
              cta={{ label: loopFeature.cta, href: ROUTES.DASHBOARD }}
              visualSide="left"
            />
          </Reveal>
        </Section>

        {/* Data flow diagram — anchors the "your data → assistant" pipeline after the feature trio. */}
        <Section theme="light" className="relative overflow-hidden">
          <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 -z-10" />
          <div className="mb-14 max-w-2xl">
            <div className="mb-5">
              <span className="eyebrow-badge">{t("data.eyebrow")}</span>
            </div>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              {copy.dataTitle}
            </h2>
            <p className="text-foreground/70 mt-5 max-w-xl text-lg leading-relaxed">
              {copy.dataDescription}
            </p>
          </div>
          <Reveal>
            <DataFlowDiagram copy={copy.dataFlow} />
          </Reveal>
        </Section>

        {/* Testimonials (light) — grid of 3 */}
        <Section theme="light">
          <div className="mb-14 text-center">
            <p className="eyebrow text-foreground/55 mb-4">{t("testimonials.eyebrow")}</p>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent mx-auto max-w-2xl [&_em]:font-normal [&_em]:italic">
              {t("testimonials.titlePre")} <em>{t("testimonials.titleEm")}</em>
            </h2>
          </div>
          <Reveal>
            <TestimonialGrid items={copy.testimonials} />
          </Reveal>
        </Section>

        {/* Pricing (dark) */}
        <Section theme="dark" id="pricing">
          <div className="mb-14 max-w-2xl">
            <div className="mb-5">
              <span className="eyebrow-badge">{t("pricing.eyebrow")}</span>
            </div>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              {t("pricing.titlePre")} <em>{t("pricing.titleEm")}</em>
            </h2>
            <p className="text-foreground/70 mt-5 max-w-xl text-lg leading-relaxed">
              {t("pricing.subtitle")}
            </p>
          </div>
          <Reveal>
            <PricingTeaser plans={copy.plans} fullPricingHref={ROUTES.PRICING} />
          </Reveal>
        </Section>

        {/* FAQ (light) */}
        <Section theme="light" id="faq">
          <div className="mb-14 text-center">
            <p className="eyebrow text-foreground/55 mb-4">{t("faq.eyebrow")}</p>
            <h2 className="text-display-lg text-foreground">{t("faq.title")}</h2>
          </div>
          <Reveal>
            <FaqAccordion
              items={faqItems.map((it) => ({ ...it, q: it.q.replace("{appName}", APP_NAME) }))}
            />
          </Reveal>
        </Section>

        {/* Final CTA */}
        <Section theme="light" padding="pb-24 md:pb-32">
          <Reveal>
            <FinalCta
              stat={{ value: t("finalCta.statValue"), label: t("finalCta.statLabel") }}
              title={
                <>
                  {t("finalCta.titlePre")} <em>{t("finalCta.titleEm")}</em>
                </>
              }
              description={t("finalCta.description")}
              primary={{ label: t("finalCta.primary"), href: ROUTES.CHAT }}
              secondary={{ label: t("finalCta.secondary"), href: ROUTES.DASHBOARD }}
            />
          </Reveal>
        </Section>
      </main>

      <MarketingFooter
        brand={APP_NAME}
        tagline={tNav("footer.tagline")}
        operationalLabel={tNav("footer.operational")}
        columns={footerColumns}
        legal={footerLegal}
      />
    </>
  );
}
