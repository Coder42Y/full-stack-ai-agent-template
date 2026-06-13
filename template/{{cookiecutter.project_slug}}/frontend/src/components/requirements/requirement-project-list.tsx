{% raw %}"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenText,
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((project) => (
        <RequirementProjectCard
          key={project.id}
          project={project}
          onDelete={() => onDelete(project.id)}
        />
      ))}
    </div>
  );
}

function RequirementProjectCard({
  project,
  onDelete,
}: {
  project: KnowledgeBase;
  onDelete: () => void;
}) {
  const title = project.project_name || project.name;
  const updatedAt = new Date(project.updated_at ?? project.created_at);

  return (
    <article className="group relative isolate min-h-[220px] overflow-hidden rounded-lg border border-foreground/10 bg-card transition-colors hover:border-foreground/25">
      <Link
        href={`/kb/${project.id}`}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
        aria-label={`打开需求项目 ${title}`}
      />
      <div className="pointer-events-none flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-foreground">
            <FolderKanban className="h-5 w-5" />
          </span>
          <div className="pointer-events-auto z-20 flex items-center gap-1">
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
            <ArrowUpRight className="h-4 w-4 text-foreground/35 transition-transform group-hover:rotate-45 group-hover:text-foreground/80" />
          </div>
        </div>

        <div className="mt-5 flex-1">
          <p className="text-xs font-mono uppercase tracking-wider text-foreground/45">
            需求项目
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-tight text-foreground">{title}</h2>
          {project.description ? (
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/65">
              {project.description}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-foreground/50">
              在一个工作台中管理 PRD、一句话需求、来源问答、拆解结果和版本变更。
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <MetaChip icon={BookOpenText} label="模式" value="产品/开发 MVP" />
          <MetaChip icon={FileText} label="范围" value={scopeLabel(project.scope)} />
          <MetaChip
            icon={CalendarClock}
            label="更新"
            value={updatedAt.toLocaleDateString()}
            className="col-span-2"
          />
        </div>
      </div>
    </article>
  );
}

function MetaChip({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof BookOpenText;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2", className)}>
      <div className="flex items-center gap-2 text-foreground/45">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function scopeLabel(scope: KnowledgeBase["scope"]) {
  if (scope === "org") return "团队";
  if (scope === "app") return "全局";
  return "个人";
}
{% endraw %}
