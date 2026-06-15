{% raw %}"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";

import { CreateKBDialog } from "@/components/kb";
import { RequirementProjectList } from "@/components/requirements";
import { EmptyState, LoadingState } from "@/components/states";
import { useKnowledgeBases } from "@/hooks";

export default function KBPage() {
  const router = useRouter();
  const { kbs, isLoading, fetchKBs, deleteKB } = useKnowledgeBases();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchKBs();
  }, [fetchKBs]);

  const counts = {
    total: kbs.length,
    workspace: kbs.filter((k) => k.scope === "org").length,
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-5 pb-8">
      <header className="rounded-md border border-foreground/10 bg-card/80">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-6 sm:p-7">
            <p className="font-mono text-[11px] uppercase tracking-wider text-foreground/55">
              需求项目
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              需求知识库
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/62">
              MVP 阶段使用产品/开发两个业务身份。每个项目集中管理 PRD 文件、一句话需求、
              有来源的问答、需求拆解、版本变更和事件回执。
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4" />
              新建项目
            </button>
          </div>
          <div className="border-foreground/10 bg-foreground/[0.025] grid grid-cols-3 gap-2 border-t p-5 lg:grid-cols-1 lg:border-t-0 lg:border-l">
            <StatPill value={counts.total} label="项目数" />
            <StatPill value={counts.workspace} label="团队范围" />
            <StatPill value="产品/开发" label="MVP 身份" />
          </div>
        </div>
      </header>

      {isLoading ? (
        <LoadingState variant="skeleton-list" rows={4} />
      ) : kbs.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="还没有需求项目"
          description="新建一个项目后，即可录入 PRD、一句话需求、来源问答、拆解结果和版本变更。"
          cta={{ label: "新建需求项目", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <RequirementProjectList projects={kbs} onDelete={deleteKB} />
      )}

      <CreateKBDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (id) => {
          await fetchKBs();
          router.push(`/kb/${id}`);
        }}
      />
    </div>
  );
}

function StatPill({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background px-4 py-3">
      <p
        className={
          typeof value === "string"
            ? "whitespace-nowrap text-lg font-semibold tabular-nums text-foreground"
            : "text-2xl font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-foreground/50">
        {label}
      </p>
    </div>
  );
}
{% endraw %}
