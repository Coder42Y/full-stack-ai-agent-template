"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useOrgStore } from "@/stores";
import type { Organization, OrganizationList, CreateOrganizationInput } from "@/types";

export function useOrganizations() {
  const { orgs, activeOrgId, setOrgs, setActiveOrgId, addOrg, updateOrg, removeOrg, activeOrg } =
    useOrgStore();

  const fetchOrgs = useCallback(async () => {
    try {
      const data = await apiClient.get<OrganizationList>("/orgs");
      setOrgs(data.items);
      if (!activeOrgId && data.items.length > 0) {
        const personal = data.items.find((o) => o.is_personal) ?? data.items[0];
        if (personal) setActiveOrgId(personal.id);
      }
    } catch {
      toast.error("加载协作空间失败");
    }
  }, [activeOrgId, setOrgs, setActiveOrgId]);

  const createOrg = useCallback(
    async (input: CreateOrganizationInput): Promise<Organization | null> => {
      try {
        const org = await apiClient.post<Organization>("/orgs", input);
        addOrg(org);
        toast.success("协作空间已创建");
        return org;
      } catch {
        toast.error("创建协作空间失败");
        return null;
      }
    },
    [addOrg],
  );

  const patchOrg = useCallback(
    async (id: string, patch: Partial<Pick<Organization, "name" | "avatar_url">>) => {
      try {
        const updated = await apiClient.patch<Organization>(`/orgs/${id}`, patch);
        updateOrg(id, updated);
        toast.success("协作空间已更新");
        return updated;
      } catch {
        toast.error("更新协作空间失败");
        return null;
      }
    },
    [updateOrg],
  );

  const deleteOrg = useCallback(
    async (id: string) => {
      try {
        await apiClient.delete(`/orgs/${id}`);
        removeOrg(id);
        toast.success("协作空间已删除");
      } catch {
        toast.error("删除协作空间失败");
      }
    },
    [removeOrg],
  );

  const switchOrg = useCallback(
    (id: string) => {
      setActiveOrgId(id);
    },
    [setActiveOrgId],
  );

  return {
    orgs,
    activeOrgId,
    activeOrg: activeOrg(),
    fetchOrgs,
    createOrg,
    patchOrg,
    deleteOrg,
    switchOrg,
  };
}
