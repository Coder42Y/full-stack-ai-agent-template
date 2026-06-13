{% raw %}"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpenCheck,
  CheckCircle2,
  FileText,
  GitBranch,
  Loader2,
  MessageSquareText,
  PencilLine,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useWebSocket } from "@/hooks/use-websocket";
import { WS_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type {
  KBDocument,
  KnowledgeBase,
  RequirementBreakdownResponse,
  RequirementChangeResponse,
  RequirementDocumentDiffResponse,
  RequirementDocumentVersionList,
  RequirementIntakeResponse,
  RequirementNotificationEvent,
  RequirementQueryResponse,
  RequirementRole,
} from "@/types";

type WorkbenchMode = "intake" | "query" | "breakdown" | "change" | "history";

interface RequirementWorkbenchProps {
  kb: KnowledgeBase;
  documents: KBDocument[];
  isUploading: boolean;
  onUpload: (file: File, role: RequirementRole) => Promise<void>;
  onCreateRequirement: (input: {
    title?: string | null;
    filename?: string | null;
    description: string;
  }, role: RequirementRole) => Promise<RequirementIntakeResponse | null>;
  onQuery: (query: string, role: RequirementRole) => Promise<RequirementQueryResponse | null>;
  onBreakdown: (
    docId: string,
    role: RequirementRole,
  ) => Promise<RequirementBreakdownResponse | null>;
  onChange: (
    docId: string,
    input: { instruction: string; apply?: boolean },
    role: RequirementRole,
  ) => Promise<RequirementChangeResponse | null>;
  onApplyDraft: (docId: string, role: RequirementRole) => Promise<RequirementChangeResponse | null>;
  onFetchVersions: (docId: string) => Promise<RequirementDocumentVersionList | null>;
  onDiffVersions: (
    docId: string,
    fromVersion?: number,
    toVersion?: number,
  ) => Promise<RequirementDocumentDiffResponse | null>;
  onRefresh: () => Promise<void> | void;
}

export function RequirementWorkbench({
  kb,
  documents,
  isUploading,
  onUpload,
  onCreateRequirement,
  onQuery,
  onBreakdown,
  onChange,
  onApplyDraft,
  onFetchVersions,
  onDiffVersions,
  onRefresh,
}: RequirementWorkbenchProps) {
  const [mode, setMode] = useState<WorkbenchMode>("intake");
  const [role, setRole] = useState<RequirementRole>("product");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(documents[0]?.id ?? null);
  const [intakeResult, setIntakeResult] = useState<RequirementIntakeResponse | null>(null);
  const [queryResult, setQueryResult] = useState<RequirementQueryResponse | null>(null);
  const [breakdownResult, setBreakdownResult] = useState<RequirementBreakdownResponse | null>(null);
  const [changeResult, setChangeResult] = useState<RequirementChangeResponse | null>(null);
  const [clarificationResult, setClarificationResult] =
    useState<RequirementChangeResponse | null>(null);
  const [events, setEvents] = useState<RequirementNotificationEvent[]>([]);
  const accessToken = useAuthStore((state) => state.accessToken);

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocId) ?? documents[0] ?? null,
    [documents, selectedDocId],
  );

  const latestDocs = documents.filter((doc) => doc.is_latest);
  const markdownDocs = documents.filter((doc) => doc.has_markdown_content);
  const projectTitle = kb.project_name || kb.name;

  const pushEvent = useCallback((event: RequirementNotificationEvent | null | undefined) => {
    if (!event) return;
    const eventKey = requirementEventKey(event);
    setEvents((prev) => [
      event,
      ...prev.filter((item) => requirementEventKey(item) !== eventKey),
    ].slice(0, 8));
  }, []);
  const wsProtocols = useMemo(
    () => (accessToken ? [`access_token.${accessToken}`, "chat"] : undefined),
    [accessToken],
  );
  const { isConnected: notificationsConnected, connect: connectNotifications } = useWebSocket({
    url: `${WS_URL}/api/v1/ws/agent`,
    protocols: wsProtocols,
    onMessage: (event) => {
      const payload = JSON.parse(event.data) as {
        type?: string;
        data?: RequirementNotificationEvent;
      };
      if (payload.type === "requirement_notification" && payload.data?.kb_id === kb.id) {
        pushEvent(payload.data);
      }
    },
  });

  useEffect(() => {
    if (!accessToken) return;
    connectNotifications();
  }, [accessToken, connectNotifications]);

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-foreground/10 bg-card p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/55">
              需求协作工作台
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {projectTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/65">
              产品负责录入与确认变更，开发负责查询、拆解和提出修改建议。
            </p>
          </div>
          <div className="min-w-[320px] space-y-3">
            <RoleSelector value={role} onChange={setRole} />
            <div className="grid grid-cols-3 gap-2">
              <Metric value={documents.length} label="文档数" />
              <Metric value={latestDocs.length} label="最新版本" />
              <Metric value={markdownDocs.length} label="Markdown" />
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <DocumentRail
          documents={documents}
          selectedId={selectedDocument?.id ?? null}
          isUploading={isUploading}
          role={role}
          onSelect={setSelectedDocId}
          onUpload={onUpload}
          onRefresh={onRefresh}
        />

        <main className="min-w-0 rounded-lg border border-foreground/10 bg-card">
          <ModeTabs active={mode} onChange={setMode} />
          <div className="p-5">
            {mode === "intake" && (
              <IntakePanel
                role={role}
                onSubmit={async (input) => {
                  const result = await onCreateRequirement(input, role);
                  setIntakeResult(result);
                  setClarificationResult(null);
                  if (result?.document_id) setSelectedDocId(result.document_id);
                  pushEvent(result?.notification_event);
                  return result;
                }}
                onAnswerClarifications={async (docId, instruction) => {
                  const result = await onChange(docId, {
                    instruction,
                    apply: true,
                  }, role);
                  setClarificationResult(result);
                  setChangeResult(result);
                  if (result?.document_id) setSelectedDocId(result.document_id);
                  pushEvent(result?.notification_event);
                  return result;
                }}
                result={intakeResult}
                clarificationResult={clarificationResult}
              />
            )}
            {mode === "query" && (
              <QueryPanel
                onSubmit={async (query) => {
                  const result = await onQuery(query, role);
                  setQueryResult(result);
                  return result;
                }}
                result={queryResult}
              />
            )}
            {mode === "breakdown" && (
              <BreakdownPanel
                selectedDocument={selectedDocument}
                result={breakdownResult}
                onSubmit={async () => {
                  if (!selectedDocument) return null;
                  const result = await onBreakdown(selectedDocument.id, role);
                  setBreakdownResult(result);
                  return result;
                }}
              />
            )}
            {mode === "change" && (
              <ChangePanel
                role={role}
                selectedDocument={selectedDocument}
                result={changeResult}
                onSubmit={async (instruction) => {
                  if (!selectedDocument) return null;
                  const result = await onChange(selectedDocument.id, {
                    instruction,
                    apply: role === "product",
                  }, role);
                  setChangeResult(result);
                  pushEvent(result?.notification_event);
                  return result;
                }}
              />
            )}
            {mode === "history" && (
              <HistoryPanel
                role={role}
                selectedDocument={selectedDocument}
                onApplyDraft={async (docId) => {
                  const result = await onApplyDraft(docId, role);
                  setChangeResult(result);
                  pushEvent(result?.notification_event);
                  if (result?.document_id) setSelectedDocId(result.document_id);
                  return result;
                }}
                onFetchVersions={onFetchVersions}
                onDiffVersions={onDiffVersions}
              />
            )}
          </div>
        </main>

        <aside className="space-y-5">
          <ResultSummary
            queryResult={queryResult}
            breakdownResult={breakdownResult}
            changeResult={changeResult}
          />
          <EventPanel events={events} />
          <NotificationStatus connected={notificationsConnected} />
        </aside>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-foreground/45">
        {label}
      </p>
    </div>
  );
}

function RoleSelector({
  value,
  onChange,
}: {
  value: RequirementRole;
  onChange: (role: RequirementRole) => void;
}) {
  const roles: Array<{ id: RequirementRole; label: string; description: string }> = [
    { id: "product", label: "产品", description: "可录入需求并确认版本变更" },
    { id: "developer", label: "开发", description: "可查询、拆解并提交修改建议" },
  ];

  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-2">
      <p className="px-1 pb-2 font-mono text-[10px] uppercase tracking-wider text-foreground/45">
        当前身份
      </p>
      <div className="grid grid-cols-2 gap-2">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            title={role.description}
            onClick={() => onChange(role.id)}
            className={cn(
              "rounded-md border px-3 py-2 text-left transition-colors",
              value === role.id
                ? "border-brand/50 bg-brand/10 text-foreground"
                : "border-foreground/10 bg-background text-foreground/60 hover:border-foreground/25",
            )}
          >
            <span className="block text-sm font-medium">{role.label}</span>
            <span className="mt-1 block text-xs leading-snug text-foreground/55">
              {role.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AIStatusBadge({
  result,
}: {
  result:
    | Pick<RequirementIntakeResponse, "ai_used" | "ai_model" | "ai_error">
    | Pick<RequirementQueryResponse, "ai_used" | "ai_model" | "ai_error">
    | Pick<RequirementBreakdownResponse, "ai_used" | "ai_model" | "ai_error">
    | Pick<RequirementChangeResponse, "ai_used" | "ai_model" | "ai_error">;
}) {
  if (result.ai_used) {
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
        AI 已响应{result.ai_model ? ` · ${result.ai_model}` : ""}
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      本地兜底{result.ai_error ? " · 模型暂不可用" : ""}
    </Badge>
  );
}

function DocumentRail({
  documents,
  selectedId,
  isUploading,
  role,
  onSelect,
  onUpload,
  onRefresh,
}: {
  documents: KBDocument[];
  selectedId: string | null;
  isUploading: boolean;
  role: RequirementRole;
  onSelect: (id: string) => void;
  onUpload: (file: File, role: RequirementRole) => Promise<void>;
  onRefresh: () => Promise<void> | void;
}) {
  const canWrite = role === "product";
  return (
    <aside className="rounded-lg border border-foreground/10 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
            来源文档
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">文档</h2>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-foreground/15 px-3 text-xs font-medium text-foreground transition-colors hover:border-foreground/35">
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={isUploading || !canWrite}
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []);
              for (const file of files) await onUpload(file, role);
              event.target.value = "";
              await onRefresh();
            }}
          />
        </label>
      </div>

      {documents.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-foreground/15 p-4 text-sm text-foreground/55">
          {canWrite ? "上传 PRD 或创建一句话需求后，即可开始项目。" : "开发身份可查看已有文档；请切换产品身份录入需求。"}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc.id)}
              className={cn(
                "w-full rounded-md border p-3 text-left transition-colors",
                selectedId === doc.id
                  ? "border-brand/50 bg-brand/10"
                  : "border-foreground/10 bg-foreground/[0.02] hover:border-foreground/25",
              )}
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-foreground/45" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge className="rounded-sm px-1.5 py-0 font-mono text-[9px] uppercase">
                      v{doc.version}
                    </Badge>
                    {doc.is_latest && (
                      <Badge className="rounded-sm bg-green-100 px-1.5 py-0 font-mono text-[9px] uppercase text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        最新
                      </Badge>
                    )}
                    {doc.has_markdown_content && (
                      <Badge className="rounded-sm bg-blue-100 px-1.5 py-0 font-mono text-[9px] uppercase text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        markdown
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function ModeTabs({
  active,
  onChange,
}: {
  active: WorkbenchMode;
  onChange: (mode: WorkbenchMode) => void;
}) {
  const modes: Array<{ id: WorkbenchMode; label: string; icon: typeof Sparkles }> = [
    { id: "intake", label: "录入", icon: Sparkles },
    { id: "query", label: "查询", icon: Search },
    { id: "breakdown", label: "拆解", icon: BookOpenCheck },
    { id: "change", label: "变更", icon: PencilLine },
    { id: "history", label: "历史", icon: GitBranch },
  ];

  return (
    <div className="grid grid-cols-2 border-b border-foreground/10 sm:grid-cols-5">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={cn(
            "flex h-12 items-center justify-center gap-2 border-r border-foreground/10 text-sm font-medium transition-colors last:border-r-0",
            active === mode.id
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
          )}
        >
          <mode.icon className="h-4 w-4" />
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function IntakePanel({
  role,
  onSubmit,
  onAnswerClarifications,
  result,
  clarificationResult,
}: {
  role: RequirementRole;
  onSubmit: (input: {
    title?: string | null;
    filename?: string | null;
    description: string;
  }) => Promise<RequirementIntakeResponse | null>;
  onAnswerClarifications: (
    docId: string,
    instruction: string,
  ) => Promise<RequirementChangeResponse | null>;
  result: RequirementIntakeResponse | null;
  clarificationResult: RequirementChangeResponse | null;
}) {
  const [title, setTitle] = useState("海外地址支持");
  const [description, setDescription] = useState(
    "用户收货地址要支持海外地址，并校验邮编和手机号格式。",
  );
  const [submitting, setSubmitting] = useState(false);
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [clarifying, setClarifying] = useState(false);
  const clarificationSectionRef = useRef<HTMLDivElement | null>(null);
  const firstClarificationInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setClarificationAnswers(result?.clarification_questions.map(() => "") ?? []);
  }, [result?.document_id, result?.clarification_questions]);

  useEffect(() => {
    if (!result?.document_id || result.clarification_questions.length === 0) return;

    const timer = window.setTimeout(() => {
      clarificationSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      firstClarificationInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [result?.document_id, result?.clarification_questions.length]);

  const canWrite = role === "product";
  const hasClarificationAnswer = clarificationAnswers.some((answer) => answer.trim());

  return (
    <PanelShell
      icon={Sparkles}
      title="用一句话创建需求"
      description="产品输入简短想法后，AI 会生成 Markdown 需求草案；澄清问题可在下方直接回答并更新版本。"
    >
      {!canWrite && (
        <div className="mb-4 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          当前是开发身份，只能查询、拆解和提交修改建议；创建需求请切换为产品。
        </div>
      )}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canWrite || !description.trim()) return;
          setSubmitting(true);
          try {
            await onSubmit({
              title: title.trim() || null,
              filename: title.trim() ? `${slugify(title)}.md` : null,
              description: description.trim(),
            });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-2">
          <label htmlFor="requirement-title" className="text-sm font-medium text-foreground">
            需求标题
          </label>
          <Input
            id="requirement-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="requirement-description" className="text-sm font-medium text-foreground">
            一句话描述
          </label>
          <Textarea
            id="requirement-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </div>
        <Button type="submit" disabled={!canWrite || !description.trim() || submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          生成需求
        </Button>
      </form>

      {result && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ResultBox title="澄清问题与回答" ref={clarificationSectionRef}>
            <div className="space-y-3">
              <AIStatusBadge result={result} />
              <p className="text-sm leading-relaxed text-foreground/65">
                在每个问题下方填写回答，然后用这些回答更新需求版本。
              </p>
              {result.clarification_questions.map((question, index) => (
                <div key={question} className="rounded-md bg-foreground/[0.04] p-3">
                  <p className="text-sm leading-relaxed text-foreground/75">{question}</p>
                  <Textarea
                    ref={index === 0 ? firstClarificationInputRef : undefined}
                    aria-label={`回答澄清问题 ${index + 1}`}
                    className="mt-2 bg-background"
                    placeholder="在这里回答这个澄清问题"
                    value={clarificationAnswers[index] ?? ""}
                    onChange={(event) => {
                      setClarificationAnswers((answers) => {
                        const next = [...answers];
                        next[index] = event.target.value;
                        return next;
                      });
                    }}
                    rows={2}
                  />
                </div>
              ))}
              <Button
                type="button"
                disabled={!canWrite || !hasClarificationAnswer || clarifying}
                onClick={async () => {
                  if (!hasClarificationAnswer) return;
                  setClarifying(true);
                  try {
                    const answers = result.clarification_questions
                      .map((question, index) => {
                        const answer = clarificationAnswers[index]?.trim();
                        if (!answer) return null;
                        return `- ${question}\n  回答：${answer}`;
                      })
                      .filter(Boolean)
                      .join("\n");
                    await onAnswerClarifications(
                      result.document_id,
                      `根据以下澄清回答更新需求文档：\n${answers}`,
                    );
                  } finally {
                    setClarifying(false);
                  }
                }}
              >
                {clarifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
                用这些回答更新需求版本
              </Button>
              {clarificationResult && (
                <div className="rounded-md border border-foreground/10 bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{changeActionLabel(clarificationResult.action)}</Badge>
                    {clarificationResult.document_id && <Badge>澄清回答已应用</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-foreground/70">{clarificationResult.message}</p>
                  {clarificationResult.markdown_preview && (
                    <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-foreground/[0.03] p-3 text-xs leading-relaxed text-foreground/75">
                      {clarificationResult.markdown_preview}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </ResultBox>
          <ResultBox title="Markdown 预览">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/75">
              {result.markdown_content}
            </pre>
          </ResultBox>
        </div>
      )}
    </PanelShell>
  );
}

function QueryPanel({
  onSubmit,
  result,
}: {
  onSubmit: (query: string) => Promise<RequirementQueryResponse | null>;
  result: RequirementQueryResponse | null;
}) {
  const [query, setQuery] = useState("海外收货地址需要校验什么？");
  const [submitting, setSubmitting] = useState(false);

  return (
    <PanelShell
      icon={Search}
      title="查询有来源的需求答案"
      description="回答必须引用原始需求文本；如果没有精确来源，结果会明确说明。"
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!query.trim()) return;
          setSubmitting(true);
          try {
            await onSubmit(query.trim());
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-2">
          <label htmlFor="requirement-query" className="text-sm font-medium text-foreground">
            需求问题
          </label>
          <Textarea
            id="requirement-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
          />
        </div>
        <Button type="submit" disabled={!query.trim() || submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          查询需求
        </Button>
      </form>

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge className={result.is_grounded ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : ""}>
                {result.is_grounded ? "有来源" : "无明确来源"}
              </Badge>
              <AIStatusBadge result={result} />
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/75">
              {result.answer}
            </pre>
          </div>
          {result.sources.length > 0 && (
            <ResultBox title="来源引用">
              <div className="space-y-3">
                {result.sources.map((source) => (
                  <CitationCard key={`${source.document_id}-${source.label}`} label={source.label} excerpt={source.excerpt} />
                ))}
              </div>
            </ResultBox>
          )}
        </div>
      )}
    </PanelShell>
  );
}

function BreakdownPanel({
  selectedDocument,
  result,
  onSubmit,
}: {
  selectedDocument: KBDocument | null;
  result: RequirementBreakdownResponse | null;
  onSubmit: () => Promise<RequirementBreakdownResponse | null>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <PanelShell
      icon={BookOpenCheck}
      title="拆解选中的需求文档"
      description="输出按章节拆分，并保留每一项对应的原始文档来源。"
    >
      <SelectedDocumentNotice document={selectedDocument} />
      <Button
        className="mt-4"
        disabled={!selectedDocument || submitting}
        onClick={async () => {
          setSubmitting(true);
          try {
            await onSubmit();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpenCheck className="mr-2 h-4 w-4" />}
        拆解文档
      </Button>

      {result && (
        <div className="mt-5 space-y-3">
          <AIStatusBadge result={result} />
          {result.answer && (
            <pre className="whitespace-pre-wrap rounded-md border border-foreground/10 bg-foreground/[0.02] p-4 text-sm leading-relaxed text-foreground/75">
              {result.answer}
            </pre>
          )}
          {result.items.map((item) => (
            <div key={item.title} className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-foreground">{item.title}</h3>
                <Badge className="shrink-0">{item.source_label}</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">{item.summary}</p>
              {item.test_focus.length > 0 && (
                <div className="mt-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                    测试关注点
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-foreground/70">
                    {item.test_focus.map((focus) => (
                      <li key={focus} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        {focus}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

function ChangePanel({
  role,
  selectedDocument,
  result,
  onSubmit,
}: {
  role: RequirementRole;
  selectedDocument: KBDocument | null;
  result: RequirementChangeResponse | null;
  onSubmit: (instruction: string) => Promise<RequirementChangeResponse | null>;
}) {
  const [instruction, setInstruction] = useState("增加验收条件：不支持的国家需要显示明确错误提示。");
  const [submitting, setSubmitting] = useState(false);
  const isProduct = role === "product";

  return (
    <PanelShell
      icon={PencilLine}
      title={isProduct ? "应用版本变更" : "提交修改建议"}
      description={
        isProduct
          ? "产品身份可以直接应用小变更并生成新的文档版本。"
          : "开发身份只能提交修改建议，AI 会记录建议并提示产品确认。"
      }
    >
      <SelectedDocumentNotice document={selectedDocument} />
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!instruction.trim() || !selectedDocument) return;
          setSubmitting(true);
          try {
            await onSubmit(instruction.trim());
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-2">
          <label htmlFor="requirement-change" className="text-sm font-medium text-foreground">
            修改说明
          </label>
          <Textarea
            id="requirement-change"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={4}
          />
        </div>
        <Button type="submit" disabled={!selectedDocument || !instruction.trim() || submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
          {isProduct ? "应用新版本" : "提交建议"}
        </Button>
      </form>

      {result && (
        <div className="mt-5 rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{changeActionLabel(result.action)}</Badge>
            {result.document_id && <Badge>新版本</Badge>}
            <AIStatusBadge result={result} />
          </div>
          <p className="mt-3 text-sm text-foreground/70">{result.message}</p>
          {result.diff_summary && (
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed text-foreground/75">
              {result.diff_summary}
            </pre>
          )}
        </div>
      )}
    </PanelShell>
  );
}

function HistoryPanel({
  role,
  selectedDocument,
  onApplyDraft,
  onFetchVersions,
  onDiffVersions,
}: {
  role: RequirementRole;
  selectedDocument: KBDocument | null;
  onApplyDraft: (docId: string) => Promise<RequirementChangeResponse | null>;
  onFetchVersions: (docId: string) => Promise<RequirementDocumentVersionList | null>;
  onDiffVersions: (
    docId: string,
    fromVersion?: number,
    toVersion?: number,
  ) => Promise<RequirementDocumentDiffResponse | null>;
}) {
  const [versions, setVersions] = useState<RequirementDocumentVersionList | null>(null);
  const [diffResult, setDiffResult] = useState<RequirementDocumentDiffResponse | null>(null);
  const [applyResult, setApplyResult] = useState<RequirementChangeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffing, setDiffing] = useState(false);
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null);

  const loadVersions = async () => {
    if (!selectedDocument) return;
    setLoading(true);
    try {
      const result = await onFetchVersions(selectedDocument.id);
      setVersions(result);
    } finally {
      setLoading(false);
    }
  };

  const loadDiff = async (fromVersion?: number, toVersion?: number) => {
    if (!selectedDocument) return;
    setDiffing(true);
    try {
      const result = await onDiffVersions(selectedDocument.id, fromVersion, toVersion);
      setDiffResult(result);
    } finally {
      setDiffing(false);
    }
  };

  useEffect(() => {
    setVersions(null);
    setDiffResult(null);
    setApplyResult(null);
  }, [selectedDocument?.id]);

  return (
    <PanelShell
      icon={GitBranch}
      title="查看版本历史与差异"
      description="读取当前需求文档的版本链，并对比最近两版 Markdown 变更。"
    >
      <SelectedDocumentNotice document={selectedDocument} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={!selectedDocument || loading} onClick={loadVersions}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
          加载版本历史
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!selectedDocument || diffing}
          onClick={() => loadDiff()}
        >
          {diffing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          对比最近两版
        </Button>
      </div>

      {versions && (
        <div className="mt-5 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
            共 {versions.total} 个版本
          </p>
          {versions.items.map((item) => (
            <div key={item.document_id} className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>v{item.version}</Badge>
                  {item.is_latest && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      最新
                    </Badge>
                  )}
                  <Badge className="bg-background">{item.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "draft" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={role !== "product" || applyingDraftId === item.document_id}
                      onClick={async () => {
                        setApplyingDraftId(item.document_id);
                        try {
                          const result = await onApplyDraft(item.document_id);
                          setApplyResult(result);
                          await loadVersions();
                        } finally {
                          setApplyingDraftId(null);
                        }
                      }}
                    >
                      {applyingDraftId === item.document_id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      应用草稿
                    </Button>
                  )}
                  {item.version > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={diffing}
                      onClick={() => loadDiff(item.version - 1, item.version)}
                    >
                      对比上一版
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-foreground/70">{item.filename}</p>
              <p className="mt-1 text-xs text-foreground/45">
                {item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : "时间未知"}
              </p>
            </div>
          ))}
        </div>
      )}

      {applyResult && (
        <div className="mt-5 rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{changeActionLabel(applyResult.action)}</Badge>
            <AIStatusBadge result={applyResult} />
          </div>
          <p className="mt-2 text-sm text-foreground/70">{applyResult.message}</p>
          {applyResult.diff_summary && (
            <p className="mt-2 text-sm text-foreground/55">{applyResult.diff_summary}</p>
          )}
        </div>
      )}

      {diffResult && (
        <div className="mt-5 rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>v{diffResult.from_version} → v{diffResult.to_version}</Badge>
            <p className="text-sm text-foreground/70">{diffResult.summary}</p>
          </div>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed text-foreground/75">
            {diffResult.diff_lines.length ? diffResult.diff_lines.join("\n") : "没有文本差异。"}
          </pre>
        </div>
      )}
    </PanelShell>
  );
}

function PanelShell({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand/15 text-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground/60">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SelectedDocumentNotice({ document }: { document: KBDocument | null }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm text-foreground/70">
      {document ? (
        <>
          已选择文档：<span className="font-medium text-foreground">{document.filename}</span>
        </>
      ) : (
        "请先选择或创建一个需求文档。"
      )}
    </div>
  );
}

function ResultSummary({
  queryResult,
  breakdownResult,
  changeResult,
}: {
  queryResult: RequirementQueryResponse | null;
  breakdownResult: RequirementBreakdownResponse | null;
  changeResult: RequirementChangeResponse | null;
}) {
  return (
    <section className="rounded-lg border border-foreground/10 bg-card p-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-foreground/45" />
        <h2 className="text-sm font-semibold text-foreground">结果上下文</h2>
      </div>
      <div className="mt-4 space-y-4">
        {queryResult?.sources.length ? (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
              最新引用
            </p>
            <div className="mt-2 space-y-2">
              {queryResult.sources.slice(0, 3).map((source) => (
                <CitationCard key={`${source.document_id}-${source.label}`} label={source.label} excerpt={source.excerpt} compact />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/55">查询后的引用来源会显示在这里。</p>
        )}
        {breakdownResult && (
          <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
              拆解结果
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {breakdownResult.items.length} 个章节项来自 {breakdownResult.filename}
            </p>
          </div>
        )}
        {changeResult && (
          <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
              最近变更
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {changeActionLabel(changeResult.action)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function EventPanel({ events }: { events: RequirementNotificationEvent[] }) {
  return (
    <section className="rounded-lg border border-foreground/10 bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-foreground/45" />
        <h2 className="text-sm font-semibold text-foreground">事件回执</h2>
      </div>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/55">
          录入和变更操作完成后，事件回执会显示在这里。
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {events.map((event, index) => (
            <div key={`${event.event_type}-${event.document_id}-${index}`} className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
                {eventTypeLabel(event.event_type)}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/70">{event.message}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {event.version && (
                  <Badge className="rounded-sm bg-background px-1.5 py-0 font-mono text-[9px] uppercase">
                    v{event.version}
                  </Badge>
                )}
                {event.status && (
                  <Badge className="rounded-sm bg-background px-1.5 py-0 font-mono text-[9px] uppercase">
                    {event.status}
                  </Badge>
                )}
              </div>
              {event.diff_summary && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-foreground/50">
                  {event.diff_summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NotificationStatus({ connected }: { connected: boolean }) {
  return (
    <section className="rounded-lg border border-foreground/10 bg-card p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            connected ? "bg-green-500" : "bg-amber-500",
          )}
        />
        <h2 className="text-sm font-semibold text-foreground">通知连接</h2>
      </div>
      <p className="mt-3 text-sm text-foreground/55">
        {connected ? "已连接，需求变更会实时推送到当前工作台。" : "正在连接需求变更通知。"}
      </p>
    </section>
  );
}

const ResultBox = forwardRef<HTMLDivElement, { title: string; children: React.ReactNode }>(
  function ResultBox({ title, children }, ref) {
    return (
      <div ref={ref} className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-foreground/45">
          {title}
        </p>
        {children}
      </div>
    );
  },
);

function CitationCard({
  label,
  excerpt,
  compact,
}: {
  label: string;
  excerpt: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">{label}</p>
      <p className={cn("mt-2 text-foreground/70", compact ? "line-clamp-3 text-xs" : "text-sm leading-relaxed")}>
        {excerpt}
      </p>
    </div>
  );
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "requirement";
}

function changeActionLabel(action: string) {
  const labels: Record<string, string> = {
    suggestion_recorded: "已记录修改建议",
    draft_created: "已生成变更草稿",
    version_created: "已创建新版本",
    draft_applied: "草稿已应用",
    approval_denied: "草稿审批被拒绝",
    not_a_draft: "不是草稿",
  };
  return labels[action] ?? action;
}

function eventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    "requirement.created": "需求已创建",
    "requirement.change_suggested": "修改建议已记录",
    "requirement.draft_created": "变更草稿已创建",
    "requirement.version_created": "新版本已创建",
    "requirement.draft_applied": "草稿已应用",
    "requirement.draft_review_denied": "草稿审批被拒绝",
  };
  return labels[eventType] ?? eventType;
}

function requirementEventKey(event: RequirementNotificationEvent) {
  return [
    event.event_type,
    event.kb_id,
    event.document_id,
    event.version ?? "",
    event.status ?? "",
    event.message,
  ].join(":");
}
{% endraw %}
