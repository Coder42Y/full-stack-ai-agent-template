"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import type {
  ConnectorInfo,
  ConnectorList,
  SyncSourceCreate,
  SyncSourceList,
  SyncSourceRead,
} from "@/lib/rag-api";
import type {
  CreateKnowledgeBaseInput,
  KBDocument,
  KBDocumentList,
  KnowledgeBase,
  KnowledgeBaseList,
  RequirementBreakdownResponse,
  RequirementChangeInput,
  RequirementChangeResponse,
  RequirementDocumentDiffResponse,
  RequirementDocumentVersionList,
  RequirementIntakeInput,
  RequirementIntakeResponse,
  RequirementQueryResponse,
  RequirementRole,
} from "@/types";

const requirementRoleHeader = (role: RequirementRole) => ({
  "X-Requirement-Role": role,
});

export function useKnowledgeBases() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchKBs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<KnowledgeBaseList>("/kb");
      setKbs(data.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      toast.error("加载需求项目失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createKB = useCallback(
    async (
      input: CreateKnowledgeBaseInput,
      role: RequirementRole = "product",
    ): Promise<KnowledgeBase | null> => {
      try {
        const kb = await apiClient.post<KnowledgeBase>("/kb", input, {
          headers: requirementRoleHeader(role),
        });
        setKbs((prev) => [kb, ...prev]);
        toast.success("需求项目已创建");
        return kb;
      } catch {
        toast.error("创建需求项目失败");
        return null;
      }
    },
    [],
  );

  const patchKB = useCallback(
    async (id: string, patch: Partial<Pick<KnowledgeBase, "name" | "description">>) => {
      try {
        const updated = await apiClient.patch<KnowledgeBase>(`/kb/${id}`, patch);
        setKbs((prev) => prev.map((k) => (k.id === id ? updated : k)));
        toast.success("需求项目已更新");
        return updated;
      } catch {
        toast.error("更新需求项目失败");
        return null;
      }
    },
    [],
  );

  const deleteKB = useCallback(async (id: string) => {
    try {
      await apiClient.delete(`/kb/${id}`);
      setKbs((prev) => prev.filter((k) => k.id !== id));
      toast.success("需求项目已删除");
    } catch {
      toast.error("删除需求项目失败");
    }
  }, []);

  return { kbs, isLoading, fetchKBs, createKB, patchKB, deleteKB };
}

/**
 * Hook for the KB detail page: fetches one KB and its documents, exposes
 * upload/delete mutations. Refetches the document list after each mutation
 * since ingestion progresses asynchronously on the worker.
 */
export function useKBDetail(id: string | null) {
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [syncSources, setSyncSources] = useState<SyncSourceRead[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [kbData, docList, sourceList, connectorList] = await Promise.all([
        apiClient.get<KnowledgeBase>(`/kb/${id}`),
        apiClient.get<KBDocumentList>(`/kb/${id}/documents`),
        apiClient.get<SyncSourceList>(`/kb/${id}/sync-sources`).catch(() => ({
          items: [] as SyncSourceRead[],
          total: 0,
        })),
        apiClient.get<ConnectorList>(`/kb/${id}/sync-sources/connectors`).catch(() => ({
          items: [] as ConnectorInfo[],
        })),
      ]);
      setKb(kbData);
      setDocuments(docList.items);
      setSyncSources(sourceList.items);
      setConnectors(connectorList.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载需求项目失败");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const uploadDocument = useCallback(
    async (file: File, role: RequirementRole = "product") => {
      if (!id) return;
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        // apiClient.post detects FormData and skips the JSON content-type;
        // the BFF route forwards it raw to FastAPI's UploadFile handler.
        const response = await fetch(`/api/kb/${id}/documents`, {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: requirementRoleHeader(role),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new ApiError(response.status, detail.detail || "上传失败");
        }
        toast.success(`已上传 ${file.name}`);
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "上传失败";
        toast.error(msg);
      } finally {
        setIsUploading(false);
      }
    },
    [id, refresh],
  );

  const deleteDocument = useCallback(
    async (docId: string) => {
      if (!id) return;
      try {
        await apiClient.delete(`/kb/${id}/documents/${docId}`);
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        toast.success("文档已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除文档失败");
      }
    },
    [id],
  );

  const createRequirementFromText = useCallback(
    async (
      input: RequirementIntakeInput,
      role: RequirementRole = "product",
    ): Promise<RequirementIntakeResponse | null> => {
      if (!id) return null;
      try {
        const created = await apiClient.post<RequirementIntakeResponse>(
          `/kb/${id}/requirements/from-text`,
          input,
          { headers: requirementRoleHeader(role) },
        );
        toast.success("需求已创建");
        await refresh();
        return created;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "创建需求失败");
        throw e;
      }
    },
    [id, refresh],
  );

  const queryRequirements = useCallback(
    async (
      query: string,
      role: RequirementRole = "developer",
    ): Promise<RequirementQueryResponse | null> => {
      if (!id) return null;
      return apiClient.post<RequirementQueryResponse>(
        `/kb/${id}/query`,
        { query, role },
        { headers: requirementRoleHeader(role) },
      );
    },
    [id],
  );

  const breakDownDocument = useCallback(
    async (
      docId: string,
      role: RequirementRole = "developer",
    ): Promise<RequirementBreakdownResponse | null> => {
      if (!id) return null;
      return apiClient.get<RequirementBreakdownResponse>(
        `/kb/${id}/documents/${docId}/breakdown`,
        { headers: requirementRoleHeader(role) },
      );
    },
    [id],
  );

  const changeRequirementDocument = useCallback(
    async (
      docId: string,
      input: RequirementChangeInput,
      role: RequirementRole = "product",
    ): Promise<RequirementChangeResponse | null> => {
      if (!id) return null;
      const response = await apiClient.post<RequirementChangeResponse>(
        `/kb/${id}/documents/${docId}/change`,
        input,
        { headers: requirementRoleHeader(role) },
      );
      if (response.document_id) {
        await refresh();
      }
      return response;
    },
    [id, refresh],
  );

  const applyRequirementDraft = useCallback(
    async (
      docId: string,
      role: RequirementRole = "product",
    ): Promise<RequirementChangeResponse | null> => {
      if (!id) return null;
      const response = await apiClient.post<RequirementChangeResponse>(
        `/kb/${id}/documents/${docId}/apply-draft`,
        {},
        { headers: requirementRoleHeader(role) },
      );
      await refresh();
      return response;
    },
    [id, refresh],
  );

  const fetchDocumentVersions = useCallback(
    async (docId: string): Promise<RequirementDocumentVersionList | null> => {
      if (!id) return null;
      return apiClient.get<RequirementDocumentVersionList>(
        `/kb/${id}/documents/${docId}/versions`,
      );
    },
    [id],
  );

  const diffDocumentVersions = useCallback(
    async (
      docId: string,
      fromVersion?: number,
      toVersion?: number,
    ): Promise<RequirementDocumentDiffResponse | null> => {
      if (!id) return null;
      const params: Record<string, string> = {};
      if (fromVersion) params.from_version = String(fromVersion);
      if (toVersion) params.to_version = String(toVersion);
      return apiClient.get<RequirementDocumentDiffResponse>(
        `/kb/${id}/documents/${docId}/diff`,
        { params },
      );
    },
    [id],
  );

  const createSyncSource = useCallback(
    async (data: SyncSourceCreate) => {
      if (!id) return;
      try {
        const created = await apiClient.post<SyncSourceRead>(`/kb/${id}/sync-sources`, data);
        setSyncSources((prev) => [created, ...prev]);
        toast.success("同步来源已连接");
        return created;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "创建同步来源失败");
        throw e;
      }
    },
    [id],
  );

  const triggerSyncSource = useCallback(
    async (sourceId: string) => {
      if (!id) return;
      try {
        await apiClient.post(`/kb/${id}/sync-sources/${sourceId}/trigger`);
        toast.success("同步已开始，文档处理完成后会显示");
        // Refresh later to pick up new docs that the worker pulls in.
        setTimeout(() => refresh(), 2000);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "触发同步失败");
      }
    },
    [id, refresh],
  );

  const deleteSyncSource = useCallback(
    async (sourceId: string) => {
      if (!id) return;
      try {
        await apiClient.delete(`/kb/${id}/sync-sources/${sourceId}`);
        setSyncSources((prev) => prev.filter((s) => s.id !== sourceId));
        toast.success("同步来源已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除同步来源失败");
      }
    },
    [id],
  );

  return {
    kb,
    documents,
    syncSources,
    connectors,
    isLoading,
    isUploading,
    error,
    refresh,
    uploadDocument,
    deleteDocument,
    createRequirementFromText,
    queryRequirements,
    breakDownDocument,
    changeRequirementDocument,
    applyRequirementDraft,
    fetchDocumentVersions,
    diffDocumentVersions,
    createSyncSource,
    triggerSyncSource,
    deleteSyncSource,
  };
}
