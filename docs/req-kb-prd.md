# 需求知识库系统 — 需求规格文档

> 基于 grill-me 会话锁定，2026-06-10
> 分支：`feature/new-project`

---

## 1. 产品定位

公司内部**需求知识库系统**。产品经理上传 PRD 文档或一句话描述需求，系统自动入库；开发人员和测试人员通过 AI 对话查询需求、获取拆解、提出修改建议。

核心价值：
- **产品**：一句话或一个文档丢进对话框，AI 帮你澄清模糊点，自动入库
- **开发/测试**：问 AI 拿需求拆解，引用原文，杜绝幻觉
- **团队**：需求变更实时通知，版本可追溯

## 2. 核心场景

### 场景 1：产品上传 PRD 文档入库
1. 产品上传 `V2.3_订单模块需求.docx`
2. 系统用 mammoth 转换为 markdown（保留原始结构），同时保留源文件
3. `markdown_content` 存入 `RAGDocument` 表，RAG chunk 入 Milvus
4. AI 自动分析文档，识别模糊点，主动追问产品澄清

### 场景 2：产品一句话创建需求
1. 产品输入"用户收货地址要支持海外地址"
2. AI 追问：支持哪些国家？运费怎么算？地址格式用什么？等等
3. 产品回答后，AI 生成结构化 markdown 文档
4. 产品确认后入库

### 场景 3：开发查询需求
1. 开发输入"用户收货地址海外地址这个需求，具体支持哪些国家？"
2. AI 先 RAG 检索 chunk 定位文档 → 再读完整 `markdown_content` 精确定位章节
3. AI 引用原文回答，标注 `[来源：文档名 > 章节名]`
4. 如果找不到精确原文，返回模糊提示："可能在 [文档名] 中相关"

### 场景 4：开发要求拆解需求
1. 开发输入"帮我拆解订单模块的需求"
2. AI 读完整文档，按章节输出拆解结果
3. 每个拆解点引用原文，不编造

### 场景 5：产品修改需求文档
1. 产品输入"把用户收货地址改成支持海外地址"
2. AI 判断改动范围：
   - 小改动（≤ 1 个段落）→ 对话内展示 diff，产品点确认后更新
   - 大改动（新增/删除/重写 ≥ 1 个章节）→ 生成草稿，产品去文档列表审批
3. 更新后：旧版标记 `is_latest=false` 保留，新版 `is_latest=true` 入库，RAG 重新索引最新版
4. WebSocket 推送变更通知给项目成员

### 场景 6：开发建议修改需求
1. 开发输入"我觉得收货地址这个字段应该改成 xxx"
2. AI 识别当前用户是 developer 角色，**不直接改文档**
3. AI 回复"这个建议已记录，建议联系产品经理确认修改"

### 场景 7：需求变更通知
1. 产品修改文档后，系统推送通知："产品经理 [姓名] 更新了 [文档名]，变更内容：[diff 摘要]"
2. 开发/测试在系统内看到通知

## 3. 关键决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 数据模型 | 文档为中心，命令为辅 |
| 2 | 一句话需求 | AI 追问澄清 → 自动生成 md 文档 → 入库 |
| 3 | 文档版本 | 版本快照：旧版保留（`is_latest=false`），RAG 只索引最新 |
| 4 | 修改确认 | 小改（≤ 1 段落）对话内 diff 确认；大改（≥ 1 章节）草稿审批 |
| 5 | 大小改动分界 | AI 自判定，system prompt 指引，宁保守勿冒进 |
| 6 | Markdown 存储 | `RAGDocument` 表加 `markdown_content TEXT` 字段 |
| 7 | DOCX 转 MD | mammoth 为主 + LlamaParse 兜底（质量不足时自动降级） |
| 8 | 反幻觉 | 强制引用原文 + chunk 定位 → 完整文档精确定位 + 模糊提示 |
| 9 | 角色权限 | 角色控制权限边界 + AI 判断意图 |
| 10 | 角色定义 | admin / product / developer / tester |
| 11 | 变更通知 | WebSocket 轻量推送 |
| 12 | LLM | DeepSeek（1M 上下文） |
| 13 | KB 组织 | 按项目切分（每个项目一个 Knowledge Base） |
| 14 | 文档模板 | 不设模板，保留原始文档结构 |

## 4. 角色权限模型

### 角色定义

`UserRole` 枚举扩展：`ADMIN` / `PRODUCT` / `DEVELOPER` / `TESTER` / `USER`（默认兜底）

### 权限矩阵

| 操作 | admin | product | developer | tester |
|------|-------|---------|-----------|--------|
| 上传文档 | ✅ | ✅ | ❌ | ❌ |
| 创建需求（一句话） | ✅ | ✅ | ❌ | ❌ |
| 修改需求文档 | ✅ | ✅ | ❌（仅建议） | ❌（仅建议） |
| 审批草稿 | ✅ | ✅ | ❌ | ❌ |
| 查询需求 | ✅ | ✅ | ✅ | ✅ |
| AI 需求拆解 | ✅ | ✅ | ✅ | ✅ |
| 下载源文件 | ✅ | ✅ | ✅ | ✅ |
| 查看历史版本 | ✅ | ✅ | ✅ | ✅ |
| 管理 KB | ✅ | ✅ | ❌ | ❌ |
| 管理用户 | ✅ | ❌ | ❌ | ❌ |

### AI 行为差异

| 角色 | AI 行为 |
|------|---------|
| product | 写入优先：识别文档修改意图 → 追问澄清 → 生成 diff/草稿 |
| developer | 读取优先：RAG 检索 → 引用原文拆解 → 建议修改不直接改 |
| tester | 读取优先：同 developer，拆解时顺带提醒测试关注点 |
| admin | 全部 |

## 5. 数据模型变更

### RAGDocument 表扩展

```python
# 新增字段
markdown_content: Mapped[str | None] = mapped_column(Text, nullable=True)
# AI 转换后的完整 markdown 内容

version: Mapped[int] = mapped_column(Integer, default=1)
# 文档版本号，每次修改 +1

is_latest: Mapped[bool] = mapped_column(Boolean, default=True)
# 是否为最新版本，旧版本标记为 False

previous_version_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rag_documents.id"), nullable=True)
# 指向上一个版本的 ID

status: Mapped[str] = mapped_column(String(20), default="processing")
# 扩展状态：processing / done / error / draft
# 新增 draft 状态用于草稿审批流

modified_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
# 最后修改人（关联 users 表）
```

### Knowledge Base 扩展

现有 KB 模型已支持按项目组织，`organization_id` 可复用为项目 ID。需要新增：

```python
project_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
# 项目名称，便于 UI 展示
```

### UserRole 枚举扩展

```python
class UserRole(str, Enum):
    USER = "user"
    PRODUCT = "product"
    DEVELOPER = "developer"
    TESTER = "tester"
    ADMIN = "admin"
```

## 6. 技术方案

### LLM 配置

```bash
# .env
AI_MODEL=deepseek-chat          # DeepSeek 对话模型
AI_BASE_URL=https://api.deepseek.com  # DeepSeek API
EMBEDDING_MODEL=embedding-3     # 或 deepseek 自有 embedding
PDF_PARSER=mammoth              # DOCX 默认用 mammoth
LLAMAPARSE_API_KEY=xxx          # 兜底用 LlamaParse
```

### DOCX → Markdown 转换链路

```
docx 上传
  ↓ mammoth 转换（本地，免费）
  ↓ 质量检查：表格数量对比、标题层级检测
  ↓ 质量合格？
  ├─ 是 → 存 markdown_content + RAG chunk
  └─ 否 → LlamaParse 转换（云端，~$0.003/页）
         → 存 markdown_content + RAG chunk
```

### 反幻觉检索链路

```
用户提问
  ↓ search_documents（RAG chunk 检索）
  ↓ 获得 chunk + parent_doc_id
  ↓ 根据 parent_doc_id 读取完整 markdown_content
  ↓ 在完整文档中精确定位章节
  ↓ 引用原文回答 + 标注来源
  ↓ 找不到？→ 模糊提示（可能相关的文档列表）
```

### 文档修改链路

```
product 说"改成 xxx"
  ↓ AI 判断改动范围
  ├─ 小改动（≤ 1 段落）
  │   ↓ 生成 diff（新增绿色/删除红色）
  │   ↓ 对话内展示 + 确认按钮
  │   ↓ 用户确认 → 旧版 is_latest=false → 新版入库
  └─ 大改动（≥ 1 章节）
      ↓ 生成草稿（status=draft）
      ↓ 提示产品去文档列表审批
      ↓ 产品审批 → 旧版 is_latest=false → 新版入库
  ↓ WebSocket 推送变更通知
```

## 7. MVP 范围

### 包含（M1-M8）

| 模块 | 功能 |
|------|------|
| M1 | 文档上传入库（docx/pdf → md 转换 + 源文件存储） |
| M2 | 一句话需求 → AI 追问 → 生成 md 文档入库 |
| M3 | 开发/测试查询需求（RAG + 强制引用原文） |
| M4 | AI 需求拆解（引用原文，按章节拆解） |
| M5 | 文档修改（小改 diff 确认 + 大改草稿审批） |
| M6 | 文档版本管理（旧版保留，RAG 只索引最新） |
| M7 | 角色权限（product/developer/tester/admin） |
| M8 | 变更通知（WebSocket 推送） |

### 不包含（后续迭代）

| 功能 | 理由 |
|------|------|
| IM 集成（钉钉/飞书） | 先走 WebSocket |
| 自动生成测试用例 | 需要额外 prompt 工程 |
| 需求关联关系 | 文档为中心靠 RAG 模糊匹配够用 |
| 原型图解析入库 | 需 OCR + 语义理解，成本高 |
| 外部文档同步（S3/Google Drive） | 内部系统大概率手动上传 |

## 8. 可复用的现有框架组件

| 组件 | 文件路径 | 复用方式 |
|------|---------|---------|
| 文档上传管道 | `app/services/rag_document.py` | 直接复用 |
| 文档解析 | `app/services/rag/documents.py` | 复用 + 扩展 mammoth |
| Chunking | `app/services/rag/documents.py` | 直接复用 |
| Embedding | `app/services/rag/embeddings.py` | 切换为 DeepSeek |
| 向量存储 | `app/services/rag/vectorstore.py` | 直接复用 |
| 检索 + 按文档检索 | `app/services/rag/retrieval.py` | 复用 `retrieve_by_document()` |
| KB 管理 + RBAC | `app/services/knowledge_base.py` | 直接复用 |
| Agent RAG tool | `app/agents/tools/rag_tool.py` | 直接复用 |
| WebSocket 通道 | 已有 | 加通知事件类型 |
| 角色检查 | `app/core/security.py` `RoleChecker` | 扩展枚举 |
| Celery worker | `app/worker/tasks/rag_tasks.py` | 直接复用 |

## 9. 验收标准

### 文档上传
- [ ] 上传 docx → 系统存储源文件 + markdown_content
- [ ] md 转换保留标题层级和表格
- [ ] mamforth 质量不足时自动降级 LlamaParse

### 一句话需求
- [ ] 产品输入一句话 → AI 追问 2-3 个澄清问题
- [ ] 产品回答后 → AI 生成 md 文档
- [ ] 产品确认后 → 文档入库 + RAG 可检索

### 需求查询
- [ ] 开发问需求问题 → AI 引用原文回答
- [ ] 回答标注 `[来源：文档名 > 章节名]`
- [ ] 找不到精确原文 → 返回模糊提示

### 需求拆解
- [ ] AI 按章节拆解需求，每点引用原文
- [ ] 不编造内容（无幻觉）

### 文档修改
- [ ] 产品说小改动 → 对话内展示 diff → 确认后更新
- [ ] 产品说大改动 → 生成草稿 → 审批后更新
- [ ] 开发建议修改 → AI 不直接改，提示联系产品

### 版本管理
- [ ] 修改后旧版保留，新版 RAG 可检索
- [ ] 开发可问"这个需求和上次比改了什么"

### 权限
- [ ] product 可上传/修改，developer/tester 只读
- [ ] developer/tester 建议修改不触发文档变更

### 通知
- [ ] 文档变更后 WebSocket 推送通知给项目成员
