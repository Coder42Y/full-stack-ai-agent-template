{% raw %}"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  Loader2,
  MessageSquareText,
  PencilLine,
  Search,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useWebSocket } from "@/hooks/use-websocket";
import { WS_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import { toast } from "sonner";
import type {
  KBDocument,
  KnowledgeBase,
  RequirementAuditLogList,
  RequirementAuditLogItem,
  RequirementBreakdownResponse,
  RequirementChangeResponse,
  RequirementClarificationResponse,
  RequirementClarificationSession,
  RequirementDocumentDiffResponse,
  RequirementDocumentDiffLine,
  RequirementDocumentVersionList,
  RequirementDraftCommentItem,
  RequirementDraftCommentList,
  RequirementIntakeResponse,
  RequirementNotificationEvent,
  RequirementNotificationItem,
  RequirementNotificationList,
  RequirementQueryResponse,
  RequirementRole,
} from "@/types";

type WorkbenchMode = "intake" | "query" | "breakdown" | "change" | "history";
type WorkbenchFocus = "clarify" | "breakdown" | "change";
type RequirementEventSource = "local" | "remote";
type RequirementEventFeedItem = RequirementNotificationEvent & {
  id?: string;
  actor_user_id?: string;
  read: boolean;
  received_at: string;
  source: RequirementEventSource;
};

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
  onRejectDraft: (
    docId: string,
    reason: string,
    role: RequirementRole,
  ) => Promise<RequirementChangeResponse | null>;
  onRollbackVersion: (
    docId: string,
    reason: string,
    role: RequirementRole,
  ) => Promise<RequirementChangeResponse | null>;
  onFetchVersions: (docId: string) => Promise<RequirementDocumentVersionList | null>;
  onFetchPendingDrafts: () => Promise<RequirementDocumentVersionList | null>;
  onFetchClarifications: (docId: string) => Promise<RequirementClarificationSession | null>;
  onAnswerClarifications: (
    docId: string,
    input: { answers: { question: string; answer: string }[]; apply?: boolean },
    role: RequirementRole,
  ) => Promise<RequirementClarificationResponse | null>;
  onFetchAuditLogs: () => Promise<RequirementAuditLogList | null>;
  onFetchDraftComments: (docId: string) => Promise<RequirementDraftCommentList | null>;
  onFetchNotifications: () => Promise<RequirementNotificationList | null>;
  onMarkNotificationRead: (notificationId: string) => Promise<RequirementNotificationList | null>;
  onMarkAllNotificationsRead: () => Promise<RequirementNotificationList | null>;
  onAddDraftComment: (
    docId: string,
    input: { body: string },
    role: RequirementRole,
  ) => Promise<RequirementDraftCommentItem | null>;
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
  onRejectDraft,
  onRollbackVersion,
  onFetchVersions,
  onFetchPendingDrafts,
  onFetchClarifications,
  onAnswerClarifications,
  onFetchAuditLogs,
  onFetchDraftComments,
  onFetchNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onAddDraftComment,
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
    useState<RequirementClarificationResponse | null>(null);
  const [events, setEvents] = useState<RequirementEventFeedItem[]>([]);
  const [notificationList, setNotificationList] = useState<RequirementNotificationList | null>(null);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const eventKeysRef = useRef<Set<string>>(new Set());
  const accessToken = useAuthStore((state) => state.accessToken);

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocId) ?? documents[0] ?? null,
    [documents, selectedDocId],
  );

  const latestDocs = documents.filter((doc) => doc.is_latest);
  const markdownDocs = documents.filter((doc) => doc.has_markdown_content);
  const pendingDocs = documents.filter((doc) => isProcessingStatus(doc.status));
  const projectTitle = kb.project_name || kb.name;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const focus = new URLSearchParams(window.location.search).get(
      "focus",
    ) as WorkbenchFocus | null;
    if (focus === "clarify") {
      setMode("intake");
      setRole("product");
    } else if (focus === "breakdown") {
      setMode("breakdown");
      setRole("developer");
    } else if (focus === "change") {
      setMode("history");
      setRole("product");
    }
  }, []);

  const pushEvent = useCallback((
    event: RequirementNotificationEvent | null | undefined,
    options: { read?: boolean; source?: RequirementEventSource; showToast?: boolean } = {},
  ) => {
    if (!event) return;
    const eventKey = requirementEventKey(event);
    if (eventKeysRef.current.has(eventKey)) return;

    const feedItem: RequirementEventFeedItem = {
      ...event,
      read: options.read ?? true,
      received_at: new Date().toISOString(),
      source: options.source ?? "local",
    };
    eventKeysRef.current.add(eventKey);
    setEvents((prev) => {
      const next = [
        feedItem,
        ...prev.filter((item) => requirementEventKey(item) !== eventKey),
      ].slice(0, 8);
      eventKeysRef.current = new Set(next.map(requirementEventKey));
      return next;
    });
    if (options.showToast) {
      toast.info(event.message, {
        description: eventTypeLabel(event.event_type),
      });
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const result = await onFetchNotifications();
      setNotificationList(result);
      if (result) {
        eventKeysRef.current = new Set(result.items.map(requirementEventKey));
      }
    } finally {
      setLoadingNotifications(false);
    }
  }, [onFetchNotifications]);

  const markEventRead = useCallback(async (event: RequirementEventFeedItem) => {
    if (!event.id) {
      setEvents((prev) => prev.map((item) => (
        requirementEventKey(item) === requirementEventKey(event)
          ? { ...item, read: true }
          : item
      )));
      return;
    }
    const result = await onMarkNotificationRead(event.id);
    if (result) setNotificationList(result);
  }, [onMarkNotificationRead]);

  const markEventsRead = useCallback(async () => {
    const result = await onMarkAllNotificationsRead();
    if (result) setNotificationList(result);
    setEvents((prev) => prev.map((event) => ({ ...event, read: true })));
  }, [onMarkAllNotificationsRead]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const eventFeed = useMemo(() => {
    const persisted = notificationList?.items.map(notificationItemToFeedItem) ?? [];
    const persistedKeys = new Set(persisted.map(requirementEventKey));
    return [
      ...events.filter((event) => !persistedKeys.has(requirementEventKey(event))),
      ...persisted,
    ].slice(0, 12);
  }, [events, notificationList]);

  const unreadCount = notificationList?.unread_count
    ?? eventFeed.filter((event) => !event.read).length;
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
        pushEvent(payload.data, { read: false, source: "remote", showToast: true });
        void loadNotifications();
      }
    },
  });

  useEffect(() => {
    if (!accessToken) return;
    connectNotifications();
  }, [accessToken, connectNotifications]);

  return (
    <div className="space-y-5 2xl:space-y-6">
      <header className="surface-panel overflow-hidden rounded-lg p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-end 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <p className="section-label">
              需求协作工作台
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {projectTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/65">
              产品负责录入与确认变更，开发负责查询拆解并提交建议，测试负责验收视角拆解与风险确认。
            </p>
          </div>
          <div className="w-full space-y-3 xl:w-[360px]">
            <RoleSelector value={role} onChange={setRole} />
            <div className="grid grid-cols-3 gap-2">
              <Metric value={documents.length} label="文档数" />
              <Metric value={latestDocs.length} label="最新版本" />
              <Metric value={markdownDocs.length} label="Markdown" />
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-2 border-t border-foreground/10 pt-4 sm:grid-cols-3">
          <WorkbenchSignal
            label="当前身份"
            value={roleSignalLabel(role)}
          />
          <WorkbenchSignal
            label="选中文档"
            value={selectedDocument ? selectedDocument.filename : "未选择"}
          />
          <WorkbenchSignal
            label="处理状态"
            value={pendingDocs.length ? `${pendingDocs.length} 个文档处理中` : "文档已就绪"}
          />
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <DocumentRail
          documents={documents}
          selectedId={selectedDocument?.id ?? null}
          isUploading={isUploading}
          role={role}
          onSelect={setSelectedDocId}
          onUpload={onUpload}
          onRefresh={onRefresh}
        />

        <main className="surface-panel min-w-0 overflow-hidden rounded-lg">
          <ModeTabs active={mode} onChange={setMode} />
          <div className="p-4 sm:p-5">
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
                onFetchClarifications={onFetchClarifications}
                onAnswerClarifications={async (docId, answers) => {
                  const result = await onAnswerClarifications(docId, {
                    answers,
                    apply: true,
                  }, role);
                  setClarificationResult(result);
                  setChangeResult(result?.change ?? null);
                  if (result?.change?.document_id) setSelectedDocId(result.change.document_id);
                  pushEvent(result?.change?.notification_event);
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
                role={role}
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
                onRejectDraft={async (docId, reason) => {
                  const result = await onRejectDraft(docId, reason, role);
                  setChangeResult(result);
                  pushEvent(result?.notification_event);
                  return result;
                }}
                onRollbackVersion={async (docId, reason) => {
                  const result = await onRollbackVersion(docId, reason, role);
                  setChangeResult(result);
                  pushEvent(result?.notification_event);
                  if (result?.document_id) setSelectedDocId(result.document_id);
                  return result;
                }}
                onFetchVersions={onFetchVersions}
                onFetchPendingDrafts={onFetchPendingDrafts}
                onFetchAuditLogs={onFetchAuditLogs}
                onFetchDraftComments={onFetchDraftComments}
                onAddDraftComment={async (docId, body) => onAddDraftComment(docId, { body }, role)}
                onDiffVersions={onDiffVersions}
              />
            )}
          </div>
        </main>

        <aside className="space-y-5 xl:col-start-2 xl:grid xl:grid-cols-2 xl:gap-5 xl:space-y-0 2xl:col-start-auto 2xl:sticky 2xl:top-20 2xl:block 2xl:space-y-5 2xl:self-start">
          <ResultSummary
            queryResult={queryResult}
            breakdownResult={breakdownResult}
            changeResult={changeResult}
          />
          <NotificationCenter
            events={eventFeed}
            unreadCount={unreadCount}
            loading={loadingNotifications}
            onRefresh={loadNotifications}
            onMarkRead={markEventRead}
            onMarkAllRead={markEventsRead}
          />
          <NotificationStatus connected={notificationsConnected} />
        </aside>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="metric-tile rounded-md px-3 py-2">
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 section-label">
        {label}
      </p>
    </div>
  );
}

function WorkbenchSignal({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-background/70 px-3 py-2 text-foreground/70 ring-1 ring-foreground/10">
      <p className="section-label">{label}</p>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

function requirementRoleLabel(role: RequirementRole) {
  if (role === "developer") return "开发";
  if (role === "tester") return "测试";
  return "产品";
}

function roleSignalLabel(role: RequirementRole) {
  if (role === "product") return "产品可写";
  return `${requirementRoleLabel(role)}只读`;
}

function readOnlyRoleLabel(role: RequirementRole) {
  return `${requirementRoleLabel(role)}身份`;
}

function intakeBlockedMessage(role: RequirementRole) {
  return `当前是${readOnlyRoleLabel(role)}，只能查询、拆解和提交修改建议；创建需求请切换为产品。`;
}

function breakdownDescription(role: RequirementRole) {
  if (role === "tester") {
    return "输出按章节拆分，突出验收场景、边界值、异常提示和回归风险，并保留原始文档来源。";
  }
  if (role === "developer") {
    return "输出按章节拆分，突出实现关注点、依赖和边界条件，并保留原始文档来源。";
  }
  return "输出按章节拆分，并保留每一项对应的原始文档来源。";
}

function changePanelTitle(role: RequirementRole) {
  return role === "product" ? "应用版本变更" : "提交修改建议";
}

function changePanelDescription(role: RequirementRole) {
  if (role === "product") return "产品身份可以直接应用小变更并生成新的文档版本。";
  if (role === "tester") return "测试身份只能提交验收、边界和风险建议，需产品确认后变更文档。";
  return "开发身份只能提交实现或拆解建议，需产品确认后变更文档。";
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
    { id: "tester", label: "测试", description: "可查询、拆解并确认验收风险" },
  ];

  return (
    <div className="rounded-md border border-foreground/10 bg-background/60 p-2">
      <p className="section-label px-1 pb-2">
        当前身份
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            title={role.description}
            onClick={() => onChange(role.id)}
            className={cn(
              "rounded-md border px-3 py-2 text-left transition-all",
              value === role.id
                ? "border-brand/50 bg-brand/12 text-foreground shadow-sm"
                : "border-foreground/10 bg-background/70 text-foreground/60 hover:border-foreground/25 hover:bg-background",
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
      <Badge variant="outline" className="bg-background/70 text-foreground/70">
        AI 已响应{result.ai_model ? ` · ${result.ai_model}` : ""}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-background/70 text-foreground/70">
      本地兜底{result.ai_error ? " · 模型暂不可用" : ""}
    </Badge>
  );
}

function groundingStatusLabel(status: RequirementQueryResponse["grounding_status"]) {
  switch (status) {
    case "grounded":
      return "原文支撑";
    case "partial":
      return "部分支撑";
    case "low_confidence":
      return "低置信";
    case "no_source":
      return "未找到来源";
    default:
      return "待确认";
  }
}

function groundingStatusClass(status: RequirementQueryResponse["grounding_status"]) {
  switch (status) {
    case "grounded":
      return "bg-background/70 text-foreground/70";
    case "partial":
      return "bg-background/70 text-foreground/70";
    case "low_confidence":
      return "border-foreground/20 bg-foreground/[0.04] text-foreground";
    case "no_source":
      return "border-foreground/20 bg-foreground/[0.04] text-foreground";
    default:
      return "bg-background/70 text-foreground/70";
  }
}

function confidenceLabel(confidence: RequirementQueryResponse["confidence"]) {
  return confidence === "high" ? "高置信" : confidence === "medium" ? "中置信" : "低置信";
}

function EvidenceList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div className="surface-raised rounded-md p-3">
      <p className="section-label">
        {title}
      </p>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/70">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-md bg-background/55 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
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
  const readOnlyRole = readOnlyRoleLabel(role);
  const latestCount = documents.filter((doc) => doc.is_latest).length;
  const processingCount = documents.filter((doc) => isProcessingStatus(doc.status)).length;
  return (
    <aside className="surface-panel rounded-lg p-4 xl:sticky xl:top-20 xl:self-start">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-label">
            来源文档
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">文档</h2>
        </div>
        <label
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-md border border-foreground/15 px-3 text-xs font-medium text-foreground transition-colors",
            canWrite
              ? "cursor-pointer hover:border-foreground/35 hover:bg-background"
              : "cursor-not-allowed opacity-45",
          )}
          title={canWrite ? "上传 PRD 或需求文档" : `${readOnlyRole}不可上传文档`}
        >
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
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat value={documents.length} label="全部" />
        <MiniStat value={latestCount} label="最新" />
        <MiniStat value={processingCount} label="处理中" />
      </div>

      {documents.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-foreground/15 bg-background/60 p-4 text-sm leading-relaxed text-foreground/55">
          {canWrite ? "上传 PRD 或创建一句话需求后，即可开始项目。" : `${readOnlyRole}可查看已有文档；请切换产品身份录入需求。`}
        </div>
      ) : (
        <div className="scrollbar-thin mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc.id)}
              className={cn(
                "w-full rounded-md border p-3 text-left transition-all",
                selectedId === doc.id
                  ? "border-brand/50 bg-brand/12 shadow-sm"
                  : "border-foreground/10 bg-background/70 hover:border-foreground/25 hover:bg-background",
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
                      <Badge variant="outline" className="rounded-sm bg-background/70 px-1.5 py-0 font-mono text-[9px] uppercase text-foreground/55">
                        最新
                      </Badge>
                    )}
                    {doc.has_markdown_content && (
                      <Badge variant="outline" className="rounded-sm bg-background/70 px-1.5 py-0 font-mono text-[9px] uppercase text-foreground/55">
                        markdown
                      </Badge>
                    )}
                    <DocumentStatusBadge status={doc.status} />
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

function MiniStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/60 px-2 py-2">
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-foreground/45">{label}</p>
    </div>
  );
}

function DocumentStatusBadge({ status }: { status: string }) {
  const isProcessing = isProcessingStatus(status);
  const isFailed = status === "failed" || status === "error";
  if (isProcessing) {
    return (
      <Badge variant="outline" className="rounded-sm bg-foreground/[0.04] px-1.5 py-0 font-mono text-[9px] uppercase text-foreground/70">
        <Clock3 className="mr-1 h-2.5 w-2.5" />
        {documentStatusLabel(status)}
      </Badge>
    );
  }
  if (isFailed) {
    return (
      <Badge variant="destructive" className="rounded-sm px-1.5 py-0 font-mono text-[9px] uppercase">
        {documentStatusLabel(status)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-sm bg-background/70 px-1.5 py-0 font-mono text-[9px] uppercase text-foreground/55">
      {documentStatusLabel(status)}
    </Badge>
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
    <div className="grid grid-cols-2 border-b border-foreground/10 bg-background/40 sm:grid-cols-5">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={cn(
            "flex h-12 items-center justify-center gap-2 border-r border-foreground/10 text-sm font-medium transition-colors last:border-r-0",
            active === mode.id
              ? "bg-foreground text-background shadow-sm"
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
  onFetchClarifications,
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
  onFetchClarifications: (docId: string) => Promise<RequirementClarificationSession | null>;
  onAnswerClarifications: (
    docId: string,
    answers: { question: string; answer: string }[],
  ) => Promise<RequirementClarificationResponse | null>;
  result: RequirementIntakeResponse | null;
  clarificationResult: RequirementClarificationResponse | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [clarificationSession, setClarificationSession] =
    useState<RequirementClarificationSession | null>(null);
  const [loadingClarificationSession, setLoadingClarificationSession] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const clarificationSectionRef = useRef<HTMLDivElement | null>(null);
  const firstClarificationInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setClarificationAnswers(result?.clarification_questions.map(() => "") ?? []);
    setClarificationSession(null);
  }, [result?.document_id, result?.clarification_questions]);

  useEffect(() => {
    if (!result?.document_id) return;
    let cancelled = false;
    setLoadingClarificationSession(true);
    onFetchClarifications(result.document_id)
      .then((session) => {
        if (!cancelled) setClarificationSession(session);
      })
      .finally(() => {
        if (!cancelled) setLoadingClarificationSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onFetchClarifications, result?.document_id]);

  useEffect(() => {
    if (!result?.document_id || result.clarification_questions.length === 0) return;

    const timer = window.setTimeout(() => {
      firstClarificationInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [result?.document_id, result?.clarification_questions.length]);

  const canWrite = role === "product";
  const structuredAnswers = result
    ? result.clarification_questions
        .map((question, index) => {
          const answer = clarificationAnswers[index]?.trim();
          return answer ? { question, answer } : null;
        })
        .filter((answer): answer is { question: string; answer: string } => answer !== null)
    : [];
  const hasClarificationAnswer = structuredAnswers.length > 0;
  const latestSession = clarificationResult?.session ?? clarificationSession;
  const latestChange = clarificationResult?.change ?? null;

  return (
    <PanelShell
      icon={Sparkles}
      title="用一句话创建需求"
      description="产品输入简短想法后，AI 会生成 Markdown 需求草案；澄清问题可在下方直接回答并更新版本。"
    >
      {!canWrite && (
        <div className="mb-4 rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-sm text-foreground/70">
          {intakeBlockedMessage(role)}
        </div>
      )}
      <div className="grid gap-5 2xl:grid-cols-[minmax(360px,4fr)_minmax(0,6fr)] 2xl:items-start">
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
              placeholder="例如：海外地址支持"
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
              placeholder="例如：用户收货地址要支持海外地址，并校验邮编和手机号格式。"
              rows={7}
              className="2xl:min-h-[220px]"
            />
          </div>
          <Button type="submit" disabled={!canWrite || !description.trim() || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            生成需求
          </Button>
        </form>

        {result ? (
          <div className="grid gap-4 xl:grid-cols-2 2xl:min-h-[520px]">
            <ResultBox
              title="澄清问题与回答"
              ref={clarificationSectionRef}
              className="2xl:max-h-[620px] 2xl:overflow-auto"
            >
              <div className="space-y-3">
                <AIStatusBadge result={result} />
                <p className="text-sm leading-relaxed text-foreground/65">
                  在每个问题下方填写回答，然后用这些回答更新需求版本。
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-background/70 text-foreground/70">
                    澄清状态：{clarificationStateLabel(latestSession?.state)}
                  </Badge>
                  {loadingClarificationSession && (
                    <Badge variant="outline" className="bg-background/70 text-foreground/60">
                      正在读取持久澄清记录
                    </Badge>
                  )}
                  {latestSession?.latest_round ? (
                    <Badge variant="outline" className="bg-background/70 text-foreground/70">
                      已保存 {latestSession.latest_round} 轮回答
                    </Badge>
                  ) : null}
                </div>
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
                      const response = await onAnswerClarifications(result.document_id, structuredAnswers);
                      if (response?.session) setClarificationSession(response.session);
                    } finally {
                      setClarifying(false);
                    }
                  }}
                >
                  {clarifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
                  用这些回答更新需求版本
                </Button>
                {clarificationResult && (
                  <div className="surface-raised rounded-md p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-background/70 text-foreground/70">
                        {changeActionLabel(latestChange?.action ?? "clarification_saved")}
                      </Badge>
                      {latestChange?.document_id && (
                        <Badge variant="outline" className="bg-background/70 text-foreground/70">
                          澄清回答已应用
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-foreground/70">{latestChange?.message}</p>
                    {latestChange?.markdown_preview && (
                      <pre className="scrollbar-thin mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-foreground/[0.03] p-3 text-xs leading-relaxed text-foreground/75">
                        {latestChange.markdown_preview}
                      </pre>
                    )}
                  </div>
                )}
                {latestSession?.rounds.length ? (
                  <div className="rounded-md border border-foreground/10 bg-background/55 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">
                      持久澄清记录
                    </p>
                    <div className="mt-3 space-y-3">
                      {latestSession.rounds.map((round) => (
                        <div key={round.id} className="rounded-md bg-foreground/[0.035] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/50">
                            <span>第 {round.round} 轮</span>
                            {round.created_at && <span>{formatDateTime(round.created_at)}</span>}
                          </div>
                          <div className="mt-2 space-y-2">
                            {round.answers.map((answer) => (
                              <div key={`${round.id}-${answer.question}`} className="text-sm leading-relaxed">
                                <p className="text-foreground/65">{answer.question}</p>
                                <p className="mt-1 text-foreground/85">回答：{answer.answer}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </ResultBox>
            <ResultBox title="Markdown 预览" className="2xl:max-h-[620px] 2xl:overflow-hidden">
              <pre className="scrollbar-thin max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/75 2xl:max-h-[560px]">
                {result.markdown_content}
              </pre>
            </ResultBox>
          </div>
        ) : (
          <div className="hidden rounded-md border border-dashed border-foreground/15 bg-background/50 p-5 text-sm leading-relaxed text-foreground/55 2xl:block">
            暂无生成结果
          </div>
        )}
      </div>
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
  const [query, setQuery] = useState("");
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
            placeholder="例如：海外收货地址需要校验什么？"
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
          <div className="surface-raised rounded-md p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className={groundingStatusClass(result.grounding_status)}>
                {groundingStatusLabel(result.grounding_status)}
              </Badge>
              <Badge variant="outline">{confidenceLabel(result.confidence)}</Badge>
              <AIStatusBadge result={result} />
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/75">
              {result.answer}
            </pre>
          </div>
          <EvidenceList title="已确认信息" items={result.facts} />
          <EvidenceList title="谨慎推断" items={result.inferences} />
          <EvidenceList title="测试关注点" items={result.test_focus} />
          <EvidenceList title="待产品确认" items={result.follow_up_questions} />
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
  role,
  selectedDocument,
  result,
  onSubmit,
}: {
  role: RequirementRole;
  selectedDocument: KBDocument | null;
  result: RequirementBreakdownResponse | null;
  onSubmit: () => Promise<RequirementBreakdownResponse | null>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <PanelShell
      icon={BookOpenCheck}
      title="拆解选中的需求文档"
      description={breakdownDescription(role)}
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
            <pre className="surface-raised whitespace-pre-wrap rounded-md p-4 text-sm leading-relaxed text-foreground/75">
              {result.answer}
            </pre>
          )}
          {result.items.map((item) => (
            <div key={item.title} className="surface-raised rounded-md p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-foreground">{item.title}</h3>
                <Badge className="shrink-0">{item.source_label}</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">{item.summary}</p>
              {item.test_focus.length > 0 && (
                <div className="mt-3">
                  <p className="section-label">
                    测试关注点
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-foreground/70">
                    {item.test_focus.map((focus) => (
                      <li key={focus} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground/45" />
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
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isProduct = role === "product";

  return (
    <PanelShell
      icon={PencilLine}
      title={changePanelTitle(role)}
      description={changePanelDescription(role)}
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
            placeholder="例如：增加验收条件：不支持的国家需要显示明确错误提示。"
            rows={4}
          />
        </div>
        <Button type="submit" disabled={!selectedDocument || !instruction.trim() || submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
          {isProduct ? "应用新版本" : "提交建议"}
        </Button>
      </form>

      {result && (
        <div className="surface-raised mt-5 rounded-md p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{changeActionLabel(result.action)}</Badge>
            {result.document_id && (
              <Badge>{result.action === "draft_created" ? "待产品确认" : "新版本"}</Badge>
            )}
            <AIStatusBadge result={result} />
          </div>
          <p className="mt-3 text-sm text-foreground/70">{result.message}</p>
          {result.diff_summary && (
            <pre className="scrollbar-thin mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background/80 p-3 text-xs leading-relaxed text-foreground/75">
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
  onRejectDraft,
  onRollbackVersion,
  onFetchVersions,
  onFetchPendingDrafts,
  onFetchAuditLogs,
  onFetchDraftComments,
  onAddDraftComment,
  onDiffVersions,
}: {
  role: RequirementRole;
  selectedDocument: KBDocument | null;
  onApplyDraft: (docId: string) => Promise<RequirementChangeResponse | null>;
  onRejectDraft: (docId: string, reason: string) => Promise<RequirementChangeResponse | null>;
  onRollbackVersion: (docId: string, reason: string) => Promise<RequirementChangeResponse | null>;
  onFetchVersions: (docId: string) => Promise<RequirementDocumentVersionList | null>;
  onFetchPendingDrafts: () => Promise<RequirementDocumentVersionList | null>;
  onFetchAuditLogs: () => Promise<RequirementAuditLogList | null>;
  onFetchDraftComments: (docId: string) => Promise<RequirementDraftCommentList | null>;
  onAddDraftComment: (
    docId: string,
    body: string,
  ) => Promise<RequirementDraftCommentItem | null>;
  onDiffVersions: (
    docId: string,
    fromVersion?: number,
    toVersion?: number,
  ) => Promise<RequirementDocumentDiffResponse | null>;
}) {
  const [versions, setVersions] = useState<RequirementDocumentVersionList | null>(null);
  const [auditLogs, setAuditLogs] = useState<RequirementAuditLogList | null>(null);
  const [diffResult, setDiffResult] = useState<RequirementDocumentDiffResponse | null>(null);
  const [applyResult, setApplyResult] = useState<RequirementChangeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [diffing, setDiffing] = useState(false);
  const [commentsByDoc, setCommentsByDoc] = useState<Record<string, RequirementDraftCommentList>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [loadingCommentsId, setLoadingCommentsId] = useState<string | null>(null);
  const [commentingDocId, setCommentingDocId] = useState<string | null>(null);
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null);
  const [rejectingDraftId, setRejectingDraftId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rollbackReasons, setRollbackReasons] = useState<Record<string, string>>({});

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

  const loadDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const result = await onFetchPendingDrafts();
      setVersions(result);
      setDiffResult(null);
    } finally {
      setLoadingDrafts(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const result = await onFetchAuditLogs();
      setAuditLogs(result);
    } finally {
      setLoadingAudit(false);
    }
  };

  const loadDraftComments = async (docId: string) => {
    setLoadingCommentsId(docId);
    try {
      const result = await onFetchDraftComments(docId);
      if (result) {
        setCommentsByDoc((prev) => ({
          ...prev,
          [docId]: result,
        }));
      }
    } finally {
      setLoadingCommentsId(null);
    }
  };

  const submitDraftComment = async (docId: string) => {
    const body = commentDrafts[docId]?.trim();
    if (!body) return;
    setCommentingDocId(docId);
    try {
      const created = await onAddDraftComment(docId, body);
      if (created) {
        setCommentsByDoc((prev) => {
          const current = prev[docId] ?? { items: [], total: 0 };
          return {
            ...prev,
            [docId]: {
              items: [...current.items, created],
              total: current.total + 1,
            },
          };
        });
        setCommentDrafts((prev) => ({ ...prev, [docId]: "" }));
      }
    } finally {
      setCommentingDocId(null);
    }
  };

  useEffect(() => {
    setVersions(null);
    setAuditLogs(null);
    setDiffResult(null);
    setApplyResult(null);
    setCommentsByDoc({});
    setCommentDrafts({});
    setRejectReasons({});
    setRollbackReasons({});
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
          disabled={loadingDrafts}
          onClick={loadDrafts}
        >
          {loadingDrafts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
          待审批草稿
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
        <Button
          type="button"
          variant="outline"
          disabled={loadingAudit}
          onClick={loadAuditLogs}
        >
          {loadingAudit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          审计日志
        </Button>
      </div>

      {versions && (
        <div className="mt-5 space-y-3">
          <p className="section-label">
            共 {versions.total} 个版本
          </p>
          {versions.items.map((item) => (
            <div key={item.document_id} className="surface-raised rounded-md p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>v{item.version}</Badge>
                  {item.is_latest && (
                    <Badge variant="outline" className="bg-background/70 text-foreground/70">
                      最新
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-background/70 text-foreground/70">{item.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "draft" && (
                    <>
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={role !== "product" || rejectingDraftId === item.document_id}
                        onClick={async () => {
                          setRejectingDraftId(item.document_id);
                          try {
                            const result = await onRejectDraft(
                              item.document_id,
                              rejectReasons[item.document_id]?.trim() || "产品拒绝该变更草稿。",
                            );
                            setApplyResult(result);
                            await loadVersions();
                          } finally {
                            setRejectingDraftId(null);
                          }
                        }}
                      >
                        {rejectingDraftId === item.document_id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="mr-2 h-4 w-4" />
                        )}
                        拒绝草稿
                      </Button>
                    </>
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
                  {!item.is_latest && item.status === "done" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={role !== "product" || rollingBackId === item.document_id}
                      onClick={async () => {
                        setRollingBackId(item.document_id);
                        try {
                          const result = await onRollbackVersion(
                            item.document_id,
                            rollbackReasons[item.document_id]?.trim() || `回滚到 v${item.version}`,
                          );
                          setApplyResult(result);
                          await loadVersions();
                        } finally {
                          setRollingBackId(null);
                        }
                      }}
                    >
                      {rollingBackId === item.document_id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <GitBranch className="mr-2 h-4 w-4" />
                      )}
                      回滚到此版
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-foreground/70">{item.filename}</p>
              {item.status === "draft" && (
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="space-y-2">
                    <p className="section-label">草稿评论流</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingCommentsId === item.document_id}
                        onClick={() => loadDraftComments(item.document_id)}
                      >
                        {loadingCommentsId === item.document_id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <MessageSquareText className="mr-2 h-4 w-4" />
                        )}
                        查看评论
                      </Button>
                    </div>
                    <DraftCommentList comments={commentsByDoc[item.document_id]} />
                    <Textarea
                      className="bg-background"
                      value={commentDrafts[item.document_id] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCommentDrafts((prev) => ({
                          ...prev,
                          [item.document_id]: value,
                        }));
                      }}
                      placeholder={`${requirementRoleLabel(role)}评论：补充对这个草稿的上下文、疑问或验收意见。`}
                      rows={2}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        commentingDocId === item.document_id
                        || !commentDrafts[item.document_id]?.trim()
                      }
                      onClick={() => submitDraftComment(item.document_id)}
                    >
                      {commentingDocId === item.document_id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquareText className="mr-2 h-4 w-4" />
                      )}
                      添加评论
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="section-label">审批说明</p>
                    <Textarea
                      className="bg-background"
                      value={rejectReasons[item.document_id] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRejectReasons((prev) => ({
                          ...prev,
                          [item.document_id]: value,
                        }));
                      }}
                      placeholder="拒绝草稿时可填写原因，例如：验收口径不完整，需要补充边界条件。"
                      rows={2}
                      disabled={role !== "product"}
                    />
                  </div>
                </div>
              )}
              {!item.is_latest && item.status === "done" && (
                <Textarea
                  className="mt-3 bg-background"
                  value={rollbackReasons[item.document_id] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRollbackReasons((prev) => ({
                      ...prev,
                      [item.document_id]: value,
                    }));
                  }}
                  placeholder="回滚原因，例如：线上验收失败，恢复到已确认版本。"
                  rows={2}
                  disabled={role !== "product"}
                />
              )}
              {item.review_note && (
                <p className="mt-2 rounded-md bg-foreground/[0.04] px-3 py-2 text-xs leading-relaxed text-foreground/65">
                  审批说明：{item.review_note}
                </p>
              )}
              <p className="mt-1 text-xs text-foreground/45">
                {item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : "时间未知"}
              </p>
            </div>
          ))}
        </div>
      )}

      {applyResult && (
        <div className="surface-raised mt-5 rounded-md p-4">
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
        <div className="surface-raised mt-5 rounded-md p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>v{diffResult.from_version} → v{diffResult.to_version}</Badge>
            <p className="text-sm text-foreground/70">{diffResult.summary}</p>
          </div>
          <StructuredDiffViewer diff={diffResult} />
        </div>
      )}

      {auditLogs && (
        <div className="mt-5 space-y-3">
          <p className="section-label">
            共 {auditLogs.total} 条审计记录
          </p>
          {auditLogs.items.length === 0 ? (
            <p className="rounded-md border border-dashed border-foreground/15 bg-background/50 p-4 text-sm text-foreground/55">
              暂无需求变更审计记录
            </p>
          ) : (
            auditLogs.items.map((item) => (
              <AuditLogCard key={item.id} item={item} />
            ))
          )}
        </div>
      )}
    </PanelShell>
  );
}

function AuditLogCard({ item }: { item: RequirementAuditLogItem }) {
  const summary = auditLogSummary(item);
  return (
    <div className="surface-raised rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{eventTypeLabel(item.action)}</Badge>
          {item.target_id && (
            <Badge variant="outline" className="bg-background/70 text-foreground/70">
              {item.target_id.slice(0, 8)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-foreground/45">
          {item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : "时间未知"}
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground/70">{summary}</p>
      <p className="mt-2 text-xs text-foreground/45">操作者：{item.actor_user_id}</p>
    </div>
  );
}

function DraftCommentList({ comments }: { comments?: RequirementDraftCommentList }) {
  if (!comments) {
    return (
      <p className="rounded-md border border-dashed border-foreground/15 bg-background/50 p-3 text-xs leading-relaxed text-foreground/55">
        点击查看评论加载草稿讨论记录。
      </p>
    );
  }
  if (comments.items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-foreground/15 bg-background/50 p-3 text-xs leading-relaxed text-foreground/55">
        暂无草稿评论。
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {comments.items.map((comment) => (
        <div key={comment.id} className="rounded-md bg-background/70 p-3 ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline" className="bg-background text-foreground/70">
              {requirementRoleLabel(comment.role)}
            </Badge>
            <p className="text-[11px] text-foreground/45">
              {comment.created_at ? new Date(comment.created_at).toLocaleString("zh-CN") : "时间未知"}
            </p>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
            {comment.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function StructuredDiffViewer({ diff }: { diff: RequirementDocumentDiffResponse }) {
  if (diff.structured_changes.length === 0) {
    return (
      <pre className="scrollbar-thin mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-background/80 p-3 text-xs leading-relaxed text-foreground/75">
        {diff.diff_lines.length ? diff.diff_lines.join("\n") : "没有文本差异。"}
      </pre>
    );
  }

  return (
    <div className="scrollbar-thin mt-3 max-h-96 overflow-auto rounded-md border border-foreground/10 bg-background/80 text-xs">
      {diff.structured_changes.map((hunk) => (
        <div key={hunk.header}>
          <div className="border-b border-foreground/10 bg-foreground/[0.04] px-3 py-2 font-mono text-foreground/55">
            {hunk.header}
          </div>
          <div className="divide-y divide-foreground/[0.06]">
            {hunk.lines.map((line, index) => (
              <DiffLineRow
                key={`${hunk.header}-${index}-${line.kind}`}
                line={line}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffLineRow({ line }: { line: RequirementDocumentDiffLine }) {
  const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
  return (
    <div
      className={cn(
        "grid grid-cols-[42px_42px_24px_minmax(0,1fr)] items-start gap-2 px-3 py-1.5 font-mono leading-relaxed",
        line.kind === "added" && "bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
        line.kind === "removed" && "bg-rose-500/10 text-rose-950 dark:text-rose-100",
        line.kind === "context" && "text-foreground/70",
      )}
    >
      <span className="select-none text-right text-foreground/35">
        {line.old_line_number ?? ""}
      </span>
      <span className="select-none text-right text-foreground/35">
        {line.new_line_number ?? ""}
      </span>
      <span className="select-none text-foreground/45">{marker}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{line.content || " "}</span>
    </div>
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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground/[0.04] text-foreground ring-1 ring-foreground/10">
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
    <div className="surface-raised flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/70">
      {document ? (
        <>
          <span>已选择文档：</span>
          <span className="min-w-0 truncate font-medium text-foreground">{document.filename}</span>
          <Badge className="rounded-sm bg-background px-1.5 py-0 font-mono text-[9px] uppercase">
            v{document.version}
          </Badge>
          <DocumentStatusBadge status={document.status} />
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
    <section className="surface-panel rounded-lg p-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-foreground/45" />
        <h2 className="text-sm font-semibold text-foreground">结果上下文</h2>
      </div>
      <div className="mt-4 space-y-4">
        {queryResult?.sources.length ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="section-label">
                最新引用
              </p>
              <Badge className={groundingStatusClass(queryResult.grounding_status)}>
                {groundingStatusLabel(queryResult.grounding_status)}
              </Badge>
            </div>
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
          <div className="surface-raised rounded-md p-3">
            <p className="section-label">
              拆解结果
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {breakdownResult.items.length} 个章节项来自 {breakdownResult.filename}
            </p>
          </div>
        )}
        {changeResult && (
          <div className="surface-raised rounded-md p-3">
            <p className="section-label">
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

function NotificationCenter({
  events,
  unreadCount,
  loading,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
}: {
  events: RequirementEventFeedItem[];
  unreadCount: number;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onMarkRead: (event: RequirementEventFeedItem) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}) {
  return (
    <section className="surface-panel rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-foreground/45" />
          <h2 className="text-sm font-semibold text-foreground">通知中心</h2>
          {unreadCount > 0 && (
            <Badge className="rounded-sm bg-foreground px-1.5 py-0 text-[9px] font-medium text-background">
              {unreadCount} 未读
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={loading}
            onClick={() => void onRefresh()}
          >
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            刷新
          </Button>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void onMarkAllRead()}
            >
              全部标记已读
            </Button>
          )}
        </div>
      </div>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/55">
          录入和变更操作完成后，持久通知会显示在这里。
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {events.map((event) => (
            <div
              key={event.id ?? requirementEventKey(event)}
              className={cn(
                "surface-raised rounded-md border p-3",
                event.read ? "border-transparent" : "border-foreground/25 bg-foreground/[0.03]",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="section-label">
                  {eventTypeLabel(event.event_type)}
                </p>
                <Badge className="rounded-sm bg-background px-1.5 py-0 font-mono text-[9px] uppercase">
                  {event.read ? "已读" : "未读"}
                </Badge>
                <Badge className="rounded-sm bg-background px-1.5 py-0 font-mono text-[9px] uppercase">
                  {event.source === "remote" ? "实时" : "本地"}
                </Badge>
              </div>
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
              {!event.read && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2 text-xs"
                  onClick={() => void onMarkRead(event)}
                >
                  标记已读
                </Button>
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
    <section className="surface-panel rounded-lg p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            connected ? "bg-foreground/70" : "bg-foreground/25",
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

const ResultBox = forwardRef<
  HTMLDivElement,
  { title: string; children: React.ReactNode; className?: string }
>(function ResultBox({ title, children, className }, ref) {
  return (
    <div ref={ref} className={cn("surface-raised rounded-md p-4", className)}>
      <p className="section-label mb-3">
        {title}
      </p>
      {children}
    </div>
  );
});

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
    <div className="surface-raised rounded-md p-3">
      <p className="section-label">{label}</p>
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clarificationStateLabel(state: string | undefined) {
  const labels: Record<string, string> = {
    drafting: "草拟中",
    clarifying: "等待澄清",
    awaiting_confirmation: "等待确认",
    ingested: "已入库",
  };
  return labels[state ?? ""] ?? "未开始";
}

function changeActionLabel(action: string) {
  const labels: Record<string, string> = {
    clarification_saved: "澄清已保存",
    suggestion_recorded: "已记录修改建议",
    draft_created: "已生成变更草稿",
    version_created: "已创建新版本",
    draft_applied: "草稿已应用",
    draft_rejected: "草稿已拒绝",
    approval_denied: "草稿审批被拒绝",
    not_a_draft: "不是草稿",
    version_rolled_back: "版本已回滚",
    rollback_denied: "版本回滚被拒绝",
    already_latest: "已是最新版本",
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
    "requirement.draft_rejected": "草稿已拒绝",
    "requirement.draft_commented": "草稿评论",
    "requirement.draft_review_denied": "草稿审批被拒绝",
    "requirement.version_rolled_back": "版本已回滚",
    "requirement.rollback_denied": "版本回滚被拒绝",
  };
  return labels[eventType] ?? eventType;
}

function notificationItemToFeedItem(item: RequirementNotificationItem): RequirementEventFeedItem {
  return {
    id: item.id,
    actor_user_id: item.actor_user_id,
    event_type: item.event_type,
    kb_id: item.kb_id,
    document_id: item.document_id,
    filename: item.filename,
    message: item.message,
    version: item.version,
    status: item.status,
    diff_summary: item.diff_summary,
    read: item.read,
    received_at: item.created_at ?? new Date().toISOString(),
    source: "remote",
  };
}

function auditLogSummary(item: RequirementAuditLogItem) {
  const details = item.details;
  const reason = typeof details.reason === "string" ? details.reason : null;
  const diffSummary = typeof details.diff_summary === "string" ? details.diff_summary : null;
  const instruction = typeof details.instruction === "string" ? details.instruction : null;
  const body = typeof details.body === "string" ? details.body : null;
  const role = typeof details.role === "string" ? details.role : null;
  const fromVersion = typeof details.from_version === "number" ? details.from_version : null;
  const rolledBackTo = typeof details.rolled_back_to_version === "number"
    ? details.rolled_back_to_version
    : null;
  const newVersion = typeof details.new_version === "number" ? details.new_version : null;

  if (item.action === "requirement.rollback") {
    return `从 v${fromVersion ?? "?"} 回滚到 v${rolledBackTo ?? "?"}, 创建 v${newVersion ?? "?"}${reason ? `。原因：${reason}` : ""}`;
  }
  if (item.action === "requirement.version_created") {
    return diffSummary || instruction || `创建新版本 v${newVersion ?? "?"}`;
  }
  if (item.action === "requirement.draft_applied") {
    return `草稿已应用为 v${newVersion ?? "?"}`;
  }
  if (item.action === "requirement.draft_rejected") {
    return reason ? `草稿已拒绝。原因：${reason}` : "草稿已拒绝";
  }
  if (item.action === "requirement.draft_commented") {
    return `${role ? `${requirementRoleLabel(role as RequirementRole)}评论：` : "草稿评论："}${body ?? ""}`;
  }
  return diffSummary || reason || instruction || "需求审计事件";
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

function isProcessingStatus(status: string) {
  return status === "pending" || status === "processing";
}

function documentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "等待",
    processing: "处理中",
    completed: "完成",
    failed: "失败",
    error: "失败",
    draft: "草稿",
    approved: "已确认",
  };
  return labels[status] ?? status;
}
{% endraw %}
