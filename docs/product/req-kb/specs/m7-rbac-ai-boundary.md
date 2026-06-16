---
type: spec
source: ../prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M7 角色权限与 AI 行为边界
priority: P0
depends_on: m0-foundation.md
---

# Spec：M7 角色权限与 AI 行为边界

## 功能概述

用角色控制需求知识库读写权限，同时把角色传入需求 AI 上下文，确保 developer 的修改意图只记录建议，不直接变更文档。MVP 前端暂只暴露产品和开发两个身份选择，不做登录鉴权拆分。

## 权限矩阵

| 操作 | admin | product | developer | tester |
|------|-------|---------|-----------|--------|
| 上传文档 | yes | yes | no | no |
| 创建需求 | yes | yes | no | no |
| 修改文档 | yes | yes | suggestion only | suggestion only |
| 审批草稿 | yes | yes | no | no |
| 查询/拆解 | yes | yes | yes | yes |
| 下载/历史版本 | yes | yes | yes | yes |
| 管理 KB | yes | yes | no | no |
| 管理用户 | yes | no | no | no |

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/core/security.py` 或 `app/api/deps.py` | 增加业务权限依赖 |
| `app/services/agent_session.py` | Agent 上下文注入角色 |
| `app/agents/prompts.py` | 角色行为边界 |
| `app/api/routes/v1/knowledge_bases.py` | 写接口加权限依赖 |

## 当前实现状态

已完成 MVP 权限边界：

- `UserRole` 已包含 `product/developer/tester`。
- `app/api/deps.py` 新增 `RequirementDemoRole` 和 `CurrentRequirementDemoWriter`，读取 `X-Requirement-Role`，MVP 中产品可写、开发不可写。
- `app/api/routes/v1/knowledge_bases.py` 的创建/更新/删除 KB、上传/删除文档、创建/触发/删除 sync source 写接口已接入 `CurrentRequirementDemoWriter`。
- 查询、文档列表和拆解保持可读；查询/拆解把当前产品或开发角色传入 AI 上下文。
- 变更接口在开发身份下调用 suggestion-only 路径，返回“建议已记录”，不生成新版本。
- 新增单元测试覆盖 product/admin 可写、developer/tester/user 不可写。

待实现增强：

- 恢复生产态真实用户身份和组织成员角色，不再依赖前端 demo header。
- tester 角色 UI 和测试视角拆解开关。

## 验收标准

1. product/admin 可上传和修改需求。
2. developer 调用写接口返回权限错误或前端禁用入口。
3. developer 在工作台中提出修改时，AI 回复“建议已记录”类信息，不生成 diff/草稿。
4. admin 仍可管理用户。
