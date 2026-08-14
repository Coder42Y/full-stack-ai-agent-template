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
    metricEmployees: string;
    metricPending: string;
    metricLeaves: string;
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
    logos: ["员工信息", "报销记录", "请假记录", "考勤记录", "制度文档", "福利政策"],
    marquee: [
      "报销查询",
      "请假记录",
      "年假规则",
      "考勤打卡",
      "报销标准",
      "福利政策",
      "差旅报销",
      "加班调休",
      "制度问答",
      "SQL 依据",
      "ECharts",
      "MCP 工具",
      "技术部",
      "市场部",
      "财务部",
      "人事部",
    ],
    heroDemo: {
      script: [
        {
          role: "user",
          text: "我最近三个月的报销记录和总额是多少？",
        },
        {
          role: "tool",
          text: "mcp_execute_query · reimbursements · 3 rows",
        },
        {
          role: "agent",
          text: "你最近三个月共 3 笔报销，合计 1,240 元，其中 2 笔已到账、1 笔审批中。需要看明细吗？",
        },
      ],
      placeholder: "询问报销、请假或制度…",
      floatingPills: [
        {
          icon: MessageSquare,
          label: "自然语言查数",
          className: "left-[-12px] top-12 md:left-[-32px] md:top-16 float-y",
        },
        {
          icon: Database,
          label: "连接企业数据库",
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
        先查数据，再看图表，最后得到<em>准确答案。</em>
      </>
    ),
    howSteps: [
      {
        icon: MessageSquare,
        title: "提出员工问题",
        body: "直接用中文询问报销、请假、年假规则或报销标准，不需要翻制度文档。",
      },
      {
        icon: Database,
        title: "Agent 查询数据",
        body: "通过 MCP 读取员工、报销、请假表，并返回可复查的查询依据。",
      },
      {
        icon: BarChart3,
        title: "给出准确答案",
        body: "把报销明细、请假记录和制度条款整理成表格、图表和带引用的答案。",
      },
    ],
    features: [
      {
        eyebrow: "企业数据库",
        title: (
          <>
            报销、请假、员工，<em>统一查询。</em>
          </>
        ),
        description:
          "内置企业员工样例数据。Agent 通过只读 MCP SQL 工具查询员工、报销、请假记录。",
        bullets: [
          {
            title: "只读 SQL 安全层",
            body: "只允许 SELECT/WITH，限制白名单表，并自动追加查询行数上限。",
          },
          {
            title: "业务口径进 Prompt",
            body: "报销类别、请假类型和考勤口径直接进入系统提示词。",
          },
          {
            title: "SQL 结果可展开",
            body: "前端把查询依据渲染成表格，方便面试时解释数据来源。",
          },
        ],
        cta: "查看知识库",
      },
      {
        eyebrow: "智能咨询",
        title: (
          <>
            从一句中文问题到<em>准确答案。</em>
          </>
        ),
        description:
          "你可以直接问“我的报销记录”“各部门报销分布”“年假怎么算”。Agent 会查数、查制度并给出带引用的答案。",
        bullets: [
          {
            title: "自动选择工具",
            body: "需要数据时调用 PostgreSQL，需要趋势和对比时调用 ECharts。",
          },
          {
            title: "三种业务模式",
            body: "快速查询、数据分析、制度问答三套 Prompt 已 seeded 到数据库。",
          },
          {
            title: "前端专用渲染",
            body: "SQL 表格和 ECharts 不再以原始 JSON 展示。",
          },
        ],
        cta: "开始咨询",
      },
      {
        eyebrow: "办事闭环",
        title: (
          <>
            不止回答问题，也给出<em>下一步指引。</em>
          </>
        ),
        description:
          "MVP 先覆盖报销、请假和制度问答；生产环境可接入工单、审批流和更多内部系统。",
        bullets: [
          {
            title: "答案可溯源",
            body: "制度类问题标注来源文档，数据类问题展示 SQL 依据。",
          },
          {
            title: "答案能落地",
            body: "回答会尽量给出具体数字、条款和下一步操作指引。",
          },
          {
            title: "架构可继续扩展",
            body: "MCP server 可以继续挂接审批流、工单和更多内部系统。",
          },
        ],
        cta: "查看工作台",
      },
    ],
    dataTitle: (
      <>
        PostgreSQL 查数，MCP 编排，<em>前端可视化。</em>
      </>
    ),
    dataDescription:
      "员工问题先进入 Agent，Agent 选择 SQL 或知识库工具，结果以表格、图表和引用回到对话。",
    dataFlow: {
      sourcesEyebrow: "企业数据",
      sources: ["员工信息", "报销记录", "请假记录", "考勤记录", "制度文档"],
      rowsLabel: "演示数据",
      readyLabel: "MCP 就绪",
      question: "我这个月报销了多少？",
      answerEyebrow: "建议",
      answer: "本月共 5 笔报销，合计 860 元，均已到账。",
    },
    mockup: {
      agentQuery: "查我这个月的报销。",
      agentAnswer: "本月共 5 笔报销，合计 860 元，均已到账。",
      agentPlaceholder: "询问报销、请假或制度...",
      ragSearch: "年假 报销 考勤",
      ragResults: [
        {
          title: "员工手册.md",
          snippet: "...入职满 1 年享 5 天年假，之后每满 1 年增加 1 天，上限 15 天...",
          score: 0.94,
        },
        {
          title: "报销制度.md",
          snippet: "...费用发生后 30 天内提交，一线城市住宿每晚不超过 500 元...",
          score: 0.87,
        },
        {
          title: "考勤制度.md",
          snippet: "...标准工时 9:00-18:00，每月迟到 3 次以内不扣款，超过按 50 元/次...",
          score: 0.82,
        },
      ],
      operationsLabel: "本月报销",
      ordersLabel: "30 天报销样本",
      metricEmployees: "员工数",
      metricPending: "审批中",
      metricLeaves: "请假数",
    },
    testimonials: [
      {
        quote:
          "我不需要翻制度文档，直接问年假和报销，Agent 会把条款、数据一起给出来。",
        name: "普通员工",
        title: "日常咨询",
        company: "技术部",
      },
      {
        quote: "报销和请假数据能直接生成图表，Demo 看起来像真实的员工服务系统。",
        name: "HR 专员",
        title: "数据统计",
        company: "人事部",
      },
      {
        quote:
          "报销和请假查询简单但清楚，后续要接入审批流和更多内部系统也能沿着 MCP 扩展。",
        name: "财务经理",
        title: "费用审核",
        company: "财务部",
      },
    ],
    plans: [
      {
        name: "MVP 演示",
        price: "4",
        cadence: " 个核心场景",
        description: "面试演示所需的最小业务闭环。",
        features: ["报销查询", "请假记录", "制度问答"],
        cta: { label: "打开聊天", href: ROUTES.CHAT },
      },
      {
        name: "运营试跑",
        price: "18",
        cadence: " 位员工",
        description: "带真实 seed 数据的运营试跑版本。",
        features: ["PostgreSQL 业务库", "MCP 查询工具", "ECharts 图表渲染", "三套业务 Prompt"],
        cta: { label: "进入工作台", href: ROUTES.DASHBOARD },
        featured: true,
        badge: "当前版本",
      },
      {
        name: "生产落地",
        price: "可扩展",
        description: "真实落地时再接入审批流、工单和更多内部系统。",
        features: ["审批流接入", "工单系统", "更多内部系统", "权限与审计"],
        cta: { label: "查看方案", href: "/contact" },
      },
    ],
  },
  en: {
    logos: [
      "Employee profiles",
      "Reimbursements",
      "Leave records",
      "Attendance",
      "Policy documents",
      "Benefits",
    ],
    marquee: [
      "Reimbursement lookup",
      "Leave records",
      "Annual leave rules",
      "Attendance check-in",
      "Reimbursement policy",
      "Benefits policy",
      "Travel expenses",
      "Overtime comp time",
      "Policy Q&A",
      "SQL evidence",
      "ECharts",
      "MCP tools",
      "Engineering",
      "Marketing",
      "Finance",
      "HR",
    ],
    heroDemo: {
      script: [
        {
          role: "user",
          text: "What are my reimbursement records and total amount for the last three months?",
        },
        {
          role: "tool",
          text: "mcp_execute_query · reimbursements · 3 rows",
        },
        {
          role: "agent",
          text: "You have 3 reimbursements in the last three months, totaling 1,240 CNY — 2 paid and 1 pending approval. Want to see the details?",
        },
      ],
      placeholder: "Ask about reimbursements, leave, or policies…",
      floatingPills: [
        {
          icon: MessageSquare,
          label: "Natural-language queries",
          className: "left-[-12px] top-12 md:left-[-32px] md:top-16 float-y",
        },
        {
          icon: Database,
          label: "Enterprise database",
          className: "right-[-8px] top-24 md:right-[-40px] md:top-28 float-y-delayed",
        },
        {
          icon: Wrench,
          label: "MCP tool calls",
          className: "left-[8%] bottom-[-18px] md:left-[12%] md:bottom-[-24px] float-y-delayed",
        },
        {
          icon: Sparkles,
          label: "Charts and suggestions",
          className: "right-[10%] bottom-[-12px] md:right-[12%] md:bottom-[-20px] float-y",
        },
      ],
    },
    howTitle: (
      <>
        Query the data, review the charts, and land on an <em>accurate answer.</em>
      </>
    ),
    howSteps: [
      {
        icon: MessageSquare,
        title: "Ask an employee question",
        body: "Ask about reimbursements, leave, annual-leave rules, or reimbursement policy in plain language — no need to dig through policy documents.",
      },
      {
        icon: Database,
        title: "Agent queries the data",
        body: "MCP tools read employee, reimbursement, and leave tables, then return auditable query evidence.",
      },
      {
        icon: BarChart3,
        title: "Deliver an accurate answer",
        body: "Reimbursement details, leave records, and policy clauses come back as tables, charts, and cited answers.",
      },
    ],
    features: [
      {
        eyebrow: "Enterprise database",
        title: (
          <>
            Reimbursements, leave, and employee records in <em>one query path.</em>
          </>
        ),
        description:
          "Seeded with employee sample data. The agent queries employee, reimbursement, and leave records through a read-only MCP SQL tool.",
        bullets: [
          {
            title: "Read-only SQL safety layer",
            body: "Only SELECT/WITH queries are allowed, tables are allow-listed, and a result limit is enforced.",
          },
          {
            title: "Business rules in the prompt",
            body: "Reimbursement categories, leave types, and attendance rules are injected into the system prompt.",
          },
          {
            title: "Expandable SQL evidence",
            body: "The frontend renders query results as tables, so the data source is easy to explain during a demo.",
          },
        ],
        cta: "View knowledge base",
      },
      {
        eyebrow: "Smart assistant",
        title: (
          <>
            From one plain-language question to an <em>accurate answer.</em>
          </>
        ),
        description:
          "Ask things like “What are my reimbursements?”, “How are reimbursements distributed across departments?”, or “How is annual leave calculated?” The agent queries data and policies and returns cited answers.",
        bullets: [
          {
            title: "Automatic tool choice",
            body: "Calls PostgreSQL for data, and ECharts when a trend or comparison should be visualized.",
          },
          {
            title: "Three business modes",
            body: "Quick lookup, data analysis, and policy Q&A prompts are seeded into the database.",
          },
          {
            title: "Frontend-native rendering",
            body: "SQL tables and ECharts are displayed as usable UI instead of raw JSON.",
          },
        ],
        cta: "Start a query",
      },
      {
        eyebrow: "Employee services loop",
        title: (
          <>
            More than answers. Clear <em>next steps.</em>
          </>
        ),
        description:
          "The MVP covers reimbursements, leave, and policy Q&A. Production can add ticketing, approval flows, and more internal systems.",
        bullets: [
          {
            title: "Answers you can trace",
            body: "Policy questions cite source documents; data questions show the SQL evidence.",
          },
          {
            title: "Answers you can act on",
            body: "Responses include concrete figures, clauses, and a suggested next step where possible.",
          },
          {
            title: "Architecture that extends",
            body: "The MCP server can later hook into approval flows, ticketing, and more internal systems.",
          },
        ],
        cta: "View workspace",
      },
    ],
    dataTitle: (
      <>
        PostgreSQL queries, MCP orchestration, <em>frontend visualization.</em>
      </>
    ),
    dataDescription:
      "An employee question goes to the agent, which picks a SQL or knowledge-base tool; results return to the conversation as tables, charts, and citations.",
    dataFlow: {
      sourcesEyebrow: "Enterprise data",
      sources: [
        "Employee profiles",
        "Reimbursements",
        "Leave records",
        "Attendance",
        "Policy documents",
      ],
      rowsLabel: "demo rows",
      readyLabel: "MCP ready",
      question: "How much did I reimburse this month?",
      answerEyebrow: "Answer",
      answer: "You have 5 reimbursements this month, totaling 860 CNY — all paid.",
    },
    mockup: {
      agentQuery: "Check my reimbursements this month.",
      agentAnswer: "You have 5 reimbursements this month, totaling 860 CNY — all paid.",
      agentPlaceholder: "Ask about reimbursements, leave, or policies...",
      ragSearch: "annual leave reimbursement attendance",
      ragResults: [
        {
          title: "employee-handbook.md",
          snippet:
            "...employees get 5 days of annual leave after 1 year, then +1 day per additional year, capped at 15 days...",
          score: 0.94,
        },
        {
          title: "reimbursement-policy.md",
          snippet:
            "...expenses must be submitted within 30 days; first-tier city hotels capped at 500 CNY per night...",
          score: 0.87,
        },
        {
          title: "attendance-policy.md",
          snippet:
            "...standard hours 9:00-18:00; up to 3 late arrivals per month are free, then 50 CNY each...",
          score: 0.82,
        },
      ],
      operationsLabel: "Reimbursements this month",
      ordersLabel: "30-day reimbursement sample",
      metricEmployees: "Employees",
      metricPending: "Pending",
      metricLeaves: "Leave requests",
    },
    testimonials: [
      {
        quote:
          "Instead of digging through policy documents, I just ask about annual leave or reimbursements — the agent returns both the policy clause and my data.",
        name: "Employee",
        title: "Daily inquiries",
        company: "Engineering",
      },
      {
        quote:
          "Reimbursement and leave data render straight into charts, so the demo feels like a real employee services system.",
        name: "HR Specialist",
        title: "Reporting",
        company: "People Ops",
      },
      {
        quote:
          "Reimbursement and leave lookups are simple but clear, and the MCP layer makes it easy to add approval flows and more internal systems later.",
        name: "Finance Manager",
        title: "Expense review",
        company: "Finance",
      },
    ],
    plans: [
      {
        name: "MVP Demo",
        price: "4",
        cadence: " core scenarios",
        description: "The smallest business loop needed for the demo.",
        features: ["Reimbursement lookup", "Leave records", "Policy Q&A"],
        cta: { label: "Open chat", href: ROUTES.CHAT },
      },
      {
        name: "Ops Pilot",
        price: "18",
        cadence: " employees",
        description: "A seeded operations pilot with realistic demo data.",
        features: [
          "PostgreSQL business tables",
          "MCP query tools",
          "ECharts chart rendering",
          "Three business prompts",
        ],
        cta: { label: "Open workspace", href: ROUTES.DASHBOARD },
        featured: true,
        badge: "Current build",
      },
      {
        name: "Production",
        price: "Extensible",
        description: "Add approval flows, ticketing, and more internal systems for real deployment.",
        features: [
          "Approval-flow integration",
          "Ticketing systems",
          "More internal systems",
          "Permissions and audit",
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
