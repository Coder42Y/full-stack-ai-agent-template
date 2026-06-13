{% raw %}"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  CalendarClock,
  FileText,
  FolderKanban,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { KnowledgeBase } from "@/types";

interface RequirementProjectListProps {
  projects: KnowledgeBase[];
  onDelete: (id: string) => void;
}

export function RequirementProjectList({ projects, onDelete }: RequirementProjectListProps) {
  if (!projects.length) return null;

  const sorted = [...projects].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime();
  });

  return (
    <div className="overflow-hidden rounded-md border border-foreground/10 bg-card/80">
      <div className="grid grid-cols-[minmax(0,1fr)_150px_150px_48px] border-b border-foreground/10 bg-foreground/[0.025] px-4 py-2 text-[11px] font-medium text-foreground/45">
        <span>项目</span>
        <span className="hidden sm:block">范围</span>
        <span className="hidden sm:block">更新时间</span>
        <span />
      </div>
      <div className="divide-y divide-foreground/10">
        {sorted.map((project) => (
          <RequirementProjectRow
            key={project.id}
            project={project}
            onDelete={() => onDelete(project.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RequirementProjectRow({
  project,
  onDelete,
}: {
  project: KnowledgeBase;
  onDelete: () => void;
}) {
  const title = project.project_name || project.name;
  const updatedAt = new Date(project.updated_at ?? project.created_at);

  return (
    <article className="group relative isolate bg-card transition-colors hover:bg-foreground/[0.025]">
      <Link
        href={`/kb/${project.id}`}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
        aria-label={`打开需求项目 ${title}`}
      />
      <div className="pointer-events-none grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_150px_150px_48px] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
            <FolderKanban className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
                {title}
              </h2>
              {project.is_default && (
                <span className="rounded-sm bg-brand/12 px-1.5 py-0.5 text-[10px] text-foreground">
                  默认
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-foreground/55">
              {project.description || "管理 PRD、一句话需求、来源问答、拆解结果和版本变更。"}
            </p>
          </div>
        </div>

        <MetaChip icon={FileText} value={scopeLabel(project.scope)} />
        <MetaChip icon={CalendarClock} value={updatedAt.toLocaleDateString("zh-CN")} />

        <div className="pointer-events-auto z-20 flex justify-end gap-1">
          {!project.is_default && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (confirm(`确定删除“${title}”？`)) onDelete();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/45 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="删除需求项目"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <ArrowUpRight className="h-4 w-4 self-center text-foreground/35 transition-transform group-hover:rotate-45 group-hover:text-foreground/80" />
        </div>
      </div>
    </article>
  );
}

function MetaChip({
  icon: Icon,
  value,
  className,
}: {
  icon: LucideIcon;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("hidden items-center gap-2 text-xs text-foreground/55 sm:flex", className)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function scopeLabel(scope: KnowledgeBase["scope"]) {
  if (scope === "org") return "团队";
  if (scope === "app") return "全局";
  return "个人";
}
{% endraw %}
