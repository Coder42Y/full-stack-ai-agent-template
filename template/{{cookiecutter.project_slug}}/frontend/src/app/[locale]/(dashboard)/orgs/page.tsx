{% raw %}"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightLeft, Building2, Camera, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

import { CreateOrgDialog } from "@/components/teams";
import { EmptyState, LoadingState } from "@/components/states";
import { useOrganizations } from "@/hooks";
import { cn } from "@/lib/utils";

export default function OrgsPage() {
  const { orgs, activeOrgId, fetchOrgs, switchOrg } = useOrganizations();
  const [createOpen, setCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingOrgIdRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleAvatarUpload = async (orgId: string, file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("头像文件过大，最大 2MB。");
      return;
    }
    setUploadingFor(orgId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/orgs/${orgId}/avatar`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "上传失败" }));
        throw new Error(err.detail || "上传失败");
      }
      toast.success("协作空间头像已更新");
      await fetchOrgs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传头像失败");
    } finally {
      setUploadingFor(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchOrgs();
      if (!cancelled) setIsLoading(false);
    })();
    if (searchParams.get("create") === "1") setCreateOpen(true);
    return () => {
      cancelled = true;
    };
  }, [fetchOrgs, searchParams]);

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 pb-8">
      <header className="rounded-md border border-foreground/10 bg-card/80">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-6 sm:p-7">
            <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/55">
              协作空间
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              团队与需求边界
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/62">
              MVP 阶段保留一个演示管理员账号。组织空间用于承载需求项目、成员关系和后续权限扩展。
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4" />
              新建协作空间
            </button>
          </div>
          <div className="border-foreground/10 bg-foreground/[0.025] border-t p-5 lg:border-t-0 lg:border-l">
            <div className="rounded-md border border-foreground/10 bg-background p-4">
              <p className="text-3xl font-semibold tabular-nums text-foreground">
                {orgs.length}
              </p>
              <p className="mt-1 text-xs text-foreground/50">协作空间数量</p>
            </div>
            <div className="mt-3 rounded-md border border-foreground/10 bg-background p-4">
              <p className="text-sm font-medium text-foreground">当前管理范围</p>
              <p className="mt-2 text-xs leading-relaxed text-foreground/55">
                需求项目、成员、头像和当前空间切换都在这里维护。
              </p>
            </div>
          </div>
        </div>
      </header>

      {isLoading ? (
        <LoadingState variant="skeleton-list" rows={3} />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="还没有协作空间"
          description="创建一个空间后，可以把需求项目、产品/开发/测试成员和后续通知边界放到同一处管理。"
          cta={{ label: "创建协作空间", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-foreground/10 bg-card/80">
          <div className="hidden grid-cols-[minmax(0,1fr)_160px_220px] border-b border-foreground/10 bg-foreground/[0.025] px-4 py-2 text-[11px] font-medium text-foreground/45 sm:grid">
            <span>空间</span>
            <span>套餐</span>
            <span className="text-right">操作</span>
          </div>
          <ul className="divide-y divide-foreground/10">
            {orgs.map((org) => {
              const isActive = org.id === activeOrgId;
              return (
                <li
                  key={org.id}
                  className={cn(
                    "grid gap-4 px-4 py-4 transition-colors sm:grid-cols-[minmax(0,1fr)_160px_220px] sm:items-center",
                    isActive ? "bg-brand/[0.05]" : "hover:bg-foreground/[0.025]",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      className="group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/[0.06] text-foreground"
                      onClick={() => {
                        pendingOrgIdRef.current = org.id;
                        fileInputRef.current?.click();
                      }}
                      disabled={uploadingFor !== null}
                      title="更换协作空间头像"
                    >
                      {org.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/orgs/${org.id}/avatar?v=${org.updated_at ?? ""}`}
                          alt={org.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-5 w-5" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="h-4 w-4 text-white" />
                      </span>
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-foreground">
                          {org.name}
                        </h2>
                        {org.is_personal && (
                          <span className="rounded-sm border border-foreground/15 px-1.5 py-0.5 text-[10px] text-foreground/60">
                            个人空间
                          </span>
                        )}
                        {isActive && (
                          <span className="rounded-sm bg-brand/12 px-1.5 py-0.5 text-[10px] text-foreground">
                            当前空间
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-foreground/52">
                        {org.slug ? `标识：${org.slug}` : "未设置空间标识"}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-foreground/60">
                    {tierLabel(org.subscription_tier)}
                  </div>

                  <div className="flex shrink-0 items-center justify-start gap-2 sm:justify-end">
                    <button
                      type="button"
                      disabled={isActive}
                      onClick={() => {
                        switchOrg(org.id);
                        router.push("/dashboard");
                      }}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                        isActive
                          ? "cursor-not-allowed text-foreground/40"
                          : "border border-foreground/15 text-foreground hover:border-foreground/40",
                      )}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      {isActive ? "当前" : "切换"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/orgs/${org.id}/members`)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-foreground/15 px-3 text-xs font-medium text-foreground transition-colors hover:border-foreground/40"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      成员
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const orgId = pendingOrgIdRef.current;
          e.target.value = "";
          if (file && orgId) handleAvatarUpload(orgId, file);
          pendingOrgIdRef.current = null;
        }}
      />
      <CreateOrgDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => fetchOrgs()}
      />
    </div>
  );
}

function tierLabel(tier: string) {
  const labels: Record<string, string> = {
    free: "免费版",
    pro: "专业版",
    team: "团队版",
    enterprise: "企业版",
  };
  return labels[tier] ?? tier;
}
{% endraw %}
