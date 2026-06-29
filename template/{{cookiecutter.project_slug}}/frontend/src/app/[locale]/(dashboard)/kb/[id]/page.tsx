{% raw %}"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";

import { RequirementWorkbench } from "@/components/requirements";
import { LoadingState } from "@/components/states";
import { useKBDetail } from "@/hooks";

interface KBDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function KBDetailPage({ params }: KBDetailPageProps) {
  const { id } = use(params);
  const {
    kb,
    documents,
    isLoading,
    isUploading,
    error,
    refresh,
    uploadDocument,
    createRequirementFromText,
    queryRequirements,
    breakDownDocument,
    changeRequirementDocument,
    applyRequirementDraft,
    rejectRequirementDraft,
    rollbackRequirementVersion,
    fetchDocumentVersions,
    fetchPendingDrafts,
    fetchRequirementClarifications,
    answerRequirementClarifications,
    fetchRequirementAuditLogs,
    fetchDraftComments,
    fetchRequirementNotifications,
    markRequirementNotificationRead,
    markAllRequirementNotificationsRead,
    addDraftComment,
    diffDocumentVersions,
  } = useKBDetail(id);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const pending = documents.some((doc) => doc.status === "pending" || doc.status === "processing");
    if (!pending) return;
    const interval = setInterval(() => refresh(), 4000);
    return () => clearInterval(interval);
  }, [documents, refresh]);

  if (isLoading && !kb) return <LoadingState />;

  if (error && !kb) {
    return (
      <div className="mx-auto flex h-64 w-full max-w-3xl flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/kb" className="text-sm font-medium text-foreground underline underline-offset-4">
          返回需求项目
        </Link>
      </div>
    );
  }

  if (!kb) return null;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-0 pb-8 2xl:max-w-[calc(100vw-4rem)]">
      <Link
        href="/kb"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/10 bg-background/70 px-3 text-sm font-medium text-foreground/60 transition-colors hover:border-foreground/25 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        需求项目
      </Link>
      <RequirementWorkbench
        kb={kb}
        documents={documents}
        isUploading={isUploading}
        onUpload={uploadDocument}
        onCreateRequirement={createRequirementFromText}
        onQuery={queryRequirements}
        onBreakdown={breakDownDocument}
        onChange={changeRequirementDocument}
        onApplyDraft={applyRequirementDraft}
        onRejectDraft={rejectRequirementDraft}
        onRollbackVersion={rollbackRequirementVersion}
        onFetchVersions={fetchDocumentVersions}
        onFetchPendingDrafts={fetchPendingDrafts}
        onFetchClarifications={fetchRequirementClarifications}
        onAnswerClarifications={answerRequirementClarifications}
        onFetchAuditLogs={fetchRequirementAuditLogs}
        onFetchDraftComments={fetchDraftComments}
        onFetchNotifications={fetchRequirementNotifications}
        onMarkNotificationRead={markRequirementNotificationRead}
        onMarkAllNotificationsRead={markAllRequirementNotificationsRead}
        onAddDraftComment={addDraftComment}
        onDiffVersions={diffDocumentVersions}
        onRefresh={refresh}
      />
    </div>
  );
}
{% endraw %}
