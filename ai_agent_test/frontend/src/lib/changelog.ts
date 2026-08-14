/**
 * Single source of truth for changelog entries shown on /changelog.
 *
 * Sorted newest-first. Each release has a version + date + title + optional
 * description + a flat list of typed changes. Add new entries at the top.
 *
 * The page picks the *Zh fields when the active locale is "zh"; the base
 * fields remain the English copy.
 *
 * Type tags drive the colored pill on the marketing page. Recognized values:
 *   - feat        new functionality
 *   - improvement enhancement to existing feature
 *   - fix         bug fix
 *   - chore       infra / refactor (rendered subdued)
 *   - security    security patch (rendered with destructive tone)
 */

export type ChangeType = "feat" | "improvement" | "fix" | "chore" | "security";

export interface ChangelogChange {
  type: ChangeType;
  text: string;
  /** 中文文案；zh locale 下优先展示 */
  textZh?: string;
}

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  titleZh?: string;
  description?: string;
  descriptionZh?: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.4.0",
    date: "2026-05-08",
    title: "WorkMate rebrand & full i18n",
    titleZh: "WorkMate 品牌改造与全站中文化",
    description:
      "Switched the template from a generic AI SaaS shell to the WorkMate enterprise employee assistant: bilingual marketing pages, localized legal pages, and a WorkMate-branded changelog.",
    descriptionZh:
      "把模板从「通用 AI SaaS 外壳」改造成 WorkMate 企业员工助手：营销页全站中英双语、法律页面中文化、更新日志品牌化。",
    changes: [
      {
        type: "feat",
        text: "Rebranded the full site from the template to the WorkMate enterprise employee assistant",
        textZh: "全站从模板品牌改造为 WorkMate 企业员工助手",
      },
      {
        type: "feat",
        text: "Localized landing, marketing, and legal pages for zh/en",
        textZh: "落地页、营销组件与法律页面中文化，中英双语可切换",
      },
      {
        type: "feat",
        text: "Changelog is now bilingual (title / description / change text)",
        textZh: "更新日志支持中英双语（标题 / 描述 / 条目）",
      },
      {
        type: "improvement",
        text: "Chinese is now the default locale; English remains fully supported",
        textZh: "中文成为默认语言，英文界面保持完整",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-07",
    title: "Employee tables + pgvector knowledge base",
    titleZh: "企业三表 + pgvector 知识库",
    description:
      "Seeded employees / reimbursements / leaves business tables and moved policy documents into a pgvector-backed knowledge base with local bge embeddings.",
    descriptionZh:
      "预置员工、报销、请假三张业务表，并将制度文档接入基于 pgvector 的知识库，使用本地 bge 向量模型。",
    changes: [
      {
        type: "feat",
        text: "Seeded employees, reimbursements, and leaves tables with realistic demo data",
        textZh: "预置员工（employees）、报销（reimbursements）、请假（leaves）三张业务表及样例数据",
      },
      {
        type: "feat",
        text: "Policy documents ingested into pgvector for vector retrieval",
        textZh: "制度文档入库 pgvector，支持向量检索",
      },
      {
        type: "feat",
        text: "Local bge embeddings — no external vector service required",
        textZh: "使用本地 bge 向量模型，不依赖外部向量服务",
      },
      {
        type: "improvement",
        text: "Policy answers now cite source documents and clauses",
        textZh: "制度问答答案标注来源文档与具体条款",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-06",
    title: "DeepSeek balance card + MCP allowlist",
    titleZh: "DeepSeek 余额卡片 + MCP 白名单",
    description:
      "Added a real-time DeepSeek balance card to the dashboard and tightened the MCP SQL tool to read-only, allowlisted, row-limited queries.",
    descriptionZh:
      "工作台新增 DeepSeek 余额卡片实时展示剩余额度；MCP SQL 工具收敛为只读、白名单表、行数受限的查询。",
    changes: [
      {
        type: "feat",
        text: "DeepSeek balance card on the dashboard shows remaining credits in real time",
        textZh: "工作台首页新增 DeepSeek 余额卡片，实时显示剩余额度",
      },
      {
        type: "feat",
        text: "MCP SQL tool restricted to an allowlist of business tables",
        textZh: "MCP SQL 工具限定白名单业务表",
      },
      {
        type: "security",
        text: "Queries are read-only (SELECT/WITH) with an enforced row limit",
        textZh: "查询仅允许 SELECT/WITH 并自动追加行数上限，杜绝写操作",
      },
      {
        type: "improvement",
        text: "SQL evidence renders as expandable tables in the chat",
        textZh: "SQL 查询依据在对话中渲染为可展开表格",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-05-05",
    title: "Smarter assistant experience",
    titleZh: "智能分析体验完善",
    description:
      "Recommendation prompts, ECharts visualization, and model switching make the assistant feel like an employee services product.",
    descriptionZh: "推荐问题、图表可视化与模型切换，让助手更像一个真正的员工服务系统。",
    changes: [
      {
        type: "feat",
        text: "Chat empty state with reimbursement / leave / policy example prompts",
        textZh: "聊天空态提供报销、请假、年假等推荐问题",
      },
      {
        type: "feat",
        text: "Reimbursement and leave data visualized with ECharts",
        textZh: "报销与请假数据通过 ECharts 可视化",
      },
      {
        type: "feat",
        text: "Model picker supports switching between DeepSeek and other models",
        textZh: "模型选择器支持切换 DeepSeek 等模型",
      },
      {
        type: "improvement",
        text: "Streamed tool calls and SQL results inline",
        textZh: "工具调用与 SQL 结果流式内联展示",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-01",
    title: "Initial release",
    titleZh: "初始版本",
    description: "First public release of the WorkMate demo built on the full-stack AI template.",
    descriptionZh: "基于全栈 AI 模板搭建的 WorkMate 企业员工助手首个公开版本。",
    changes: [
      {
        type: "feat",
        text: "FastAPI + Next.js stack with JWT auth, organizations, and RBAC",
        textZh: "FastAPI + Next.js 全栈，含 JWT 登录、组织与权限",
      },
      {
        type: "feat",
        text: "Enterprise employee assistant demo around reimbursements, leave, and policies",
        textZh: "围绕报销、请假、制度的员工 AI 助手 Demo",
      },
      {
        type: "feat",
        text: "RAG knowledge base over pgvector",
        textZh: "基于 pgvector 的制度知识库检索",
      },
      {
        type: "feat",
        text: "Three seeded business prompt modes: lookup, analysis, policy Q&A",
        textZh: "预置快速查询、数据分析、制度问答三套业务 Prompt",
      },
    ],
  },
];
