---
type: spec
source:
  - ../prd.md
  - README.md
created: 2026-06-12
status: implemented
scope: M9 前端需求工作台与产品/开发 MVP
---

# Spec：M9 前端需求工作台与产品/开发 MVP

## 1. 背景

现有后端已经打通需求知识库 MVP API，但前端仍以通用 RAG/Knowledge Base 页面为主，浏览器演示看不到 PRD 主线。MVP 阶段先取消登录鉴权复杂度，在工作台内提供“产品/开发”两个身份选择，用于演示真实角色边界。

## 2. 产品目标

- 将 `/kb` 从通用知识库列表重构为“需求项目”入口。
- 将 `/kb/[id]` 从通用文档上传页重构为“需求工作台”。
- 前端提供产品/开发身份切换，不做登录鉴权分流。
- MVP 演示界面默认使用中文文案，避免浏览器演示时仍呈现英文产品体验。
- 用模式切换承载 PRD 行为：录入、查询、拆解、变更。
- 浏览器中可以完成一条 PRD 演示链路：产品创建项目 → 一句话需求 → 回答澄清问题并生成新版本 → 开发查询引用 → 开发拆解 → 开发提交修改建议 → 产品应用变更 → 事件回执。

## 3. 信息架构

### `/kb` 需求项目页

职责：

- 显示需求项目卡片。
- 卡片突出 `project_name`、KB 名称、scope、更新时间。
- 创建项目弹窗收集项目名称、需求库名称、描述、scope。
- 空状态直接引导创建需求项目。

### `/kb/[id]` 需求工作台

布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ 项目头部：项目名 / 文档数 / 最新版本 / Markdown 覆盖率 / 事件数 │
├───────────────┬──────────────────────────────┬───────────────┤
│ 文档列表       │ 四种工作模式                  │ 事件与结果       │
│ 版本、状态      │ 录入 / 查询 / 拆解 / 变更       │ 引用、diff、通知  │
└───────────────┴──────────────────────────────┴───────────────┘
```

工作模式：

- `intake`：一句话创建需求，返回澄清问题和 Markdown 预览；用户可在澄清问题下直接填写回答，并提交为需求文档新版本。
- `query`：输入需求问题，返回 grounded answer 和来源引用。
- `breakdown`：选择文档，返回按章节拆解和测试关注点。
- `change`：选择文档，输入修改说明；产品可直接应用生成新版本，开发只能提交修改建议。

## 4. MVP 角色策略

MVP 前端不做登录鉴权拆分，但展示产品/开发两个业务身份。

- 默认身份为产品，可创建需求项目、上传文档、录入一句话需求、回答澄清并应用版本变更。
- 切换为开发后，录入和上传入口禁用，查询/拆解可用。
- 开发在变更页提交的是修改建议，后端不会直接生成新版本。
- 前端通过 `X-Requirement-Role` 传递 MVP 角色；后端 demo 依赖解析该 header。
- 后端现有 JWT/RBAC 暂不拆，前端演示流程继续使用 demo admin 自动登录获取会话。

## 5. 文件范围

新增：

- `frontend/src/components/requirements/requirement-project-list.tsx`
- `frontend/src/components/requirements/requirement-workbench.tsx`
- `frontend/src/components/requirements/index.ts`

修改：

- `frontend/src/app/[locale]/(dashboard)/kb/page.tsx`
- `frontend/src/app/[locale]/(dashboard)/kb/[id]/page.tsx`
- `frontend/src/components/kb/create-kb-dialog.tsx`
- `frontend/src/components/layout/sidebar.tsx`
- `frontend/src/components/layout/mobile-tab-bar.tsx`
- `frontend/src/components/layout/header.tsx`
- `frontend/src/components/layout/command-palette.tsx`
- `frontend/src/components/layout/breadcrumb.tsx`
- `frontend/src/hooks/use-knowledge-bases.ts`

## 6. 中文界面要求

MVP 阶段面向浏览器演示的需求知识库界面必须使用中文。

- `/kb` 页面标题、说明、统计项、空状态、按钮和创建弹窗均使用中文。
- `/kb/[id]` 工作台的导航、文档列表、四个模式、表单、澄清回答、按钮、结果摘要、来源引用和事件回执均使用中文。
- 侧边栏、顶部导航、移动端底部导航、命令面板和面包屑中与该功能相关的入口统一命名为“需求项目”或“需求”。
- 技术内部字段、API 路径、TypeScript 类型、`Markdown`、版本号和文件名可以保留英文或原始值。

## 7. API 复用

沿用已有 BFF 和 hook：

- `GET /api/kb`
- `POST /api/kb`
- `GET /api/kb/{id}`
- `GET /api/kb/{id}/documents`
- `POST /api/kb/{id}/documents`
- `POST /api/kb/{id}/requirements/from-text`
- `POST /api/kb/{id}/query`
- `GET /api/kb/{id}/documents/{docId}/breakdown`
- `POST /api/kb/{id}/documents/{docId}/change`

## 8. 验收标准

1. `/kb` 页面标题、空状态、卡片和创建弹窗均呈现“需求项目”语义。已实现。
2. 创建项目可填写 `project_name` 并成功进入项目工作台。已实现。
3. `/kb/[id]` 以需求工作台呈现，不再是单纯文档上传页。已实现。
4. 工作台支持一句话需求创建，并展示澄清问题、Markdown 预览和事件。已实现。
5. 工作台支持在澄清问题下直接填写回答，并将回答应用成新的需求文档版本。已实现。
6. 工作台支持需求查询，并展示 `is_grounded`、answer 和来源引用。已实现。
7. 工作台支持选择文档拆解，并展示章节、原文摘录和测试关注点。已实现。
8. 工作台支持选择文档应用变更，并展示 action、diff 摘要、新版本 ID 和事件。已实现。
9. 前端导航将 KB 命名为“需求项目”或“需求”，移动端同步更新。已实现。
10. M9 相关用户可见文案默认中文，浏览器演示不出现英文主界面。已实现。
11. 生成项目的 frontend type-check 或 build 至少一项通过。已通过 `npm run type-check`。
12. 工作台支持产品/开发身份切换，并将身份透传给 BFF/FastAPI。已实现。
13. 开发身份下创建/上传入口禁用，变更提交为建议而不是新版本。已实现。

## 9. 后续迭代

- 恢复生产态真实登录用户、组织成员角色和 tester 身份。
- 对话式多轮澄清。
- 小改 diff 可视化确认、大改草稿审批列表。
- WebSocket 实时事件流。
- 历史版本列表和版本对比。
