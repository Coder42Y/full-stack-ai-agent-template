"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MailPlus, Plus, UserPlus, Users } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useOrganizations } from "@/hooks";
import type { InvitationList, OrganizationMemberList } from "@/types";

export function TeamSummary() {
  const { activeOrg } = useOrganizations();
  const [members, setMembers] = useState<OrganizationMemberList | null>(null);
  const [invitations, setInvitations] = useState<InvitationList | null>(null);
  const [loading, setLoading] = useState(true);

  const orgId = activeOrg?.id ?? null;

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient.get<OrganizationMemberList>(`/orgs/${orgId}/members`).catch(() => null),
      apiClient.get<InvitationList>(`/orgs/${orgId}/invitations`).catch(() => null),
    ]).then(([m, i]) => {
      if (cancelled) return;
      setMembers(m);
      setInvitations(i);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!activeOrg) {
    return null;
  }

  // Personal org -> CTA to create a real workspace
  if (activeOrg.is_personal) {
    return (
      <section className="border-border bg-card flex flex-col rounded-2xl border p-5 lg:p-6">
        <header>
          <p className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase">
            团队
          </p>
          <h2 className="font-display text-foreground mt-1 text-xl font-semibold tracking-tight">
            个人协作空间
          </h2>
        </header>
        <p className="text-foreground/65 mt-3 text-sm">
          当前是个人空间。创建组织后可以邀请成员，共享需求对话和需求项目。
        </p>
        <div className="mt-auto pt-5">
          <Link
            href="/orgs?create=1"
            className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            创建组织
          </Link>
        </div>
      </section>
    );
  }

  const memberCount = members?.total ?? 0;
  const pendingCount = (invitations?.items ?? []).filter((i) => i.status === "pending").length;

  return (
    <section className="border-border bg-card flex flex-col rounded-2xl border p-5 lg:p-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase">
            团队 · {activeOrg.name}
          </p>
          <h2 className="font-display text-foreground mt-1 text-xl font-semibold tracking-tight">
            成员与邀请
          </h2>
        </div>
        <Link
          href={`/orgs/${activeOrg.id}/members`}
          className="text-foreground/55 hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors"
        >
          管理
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="成员"
          value={loading ? null : memberCount}
        />
        <Stat
          icon={<MailPlus className="h-4 w-4" />}
          label="待接受邀请"
          value={loading ? null : pendingCount}
          tone={pendingCount > 0 ? "accent" : "neutral"}
        />
      </div>

      <div className="mt-auto pt-5">
        <Link
          href={`/orgs/${activeOrg.id}/members`}
          className="border-foreground/15 hover:border-foreground/40 text-foreground inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          邀请成员
        </Link>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  tone?: "neutral" | "accent";
}) {
  const accent = tone === "accent" && value !== null && value > 0;
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent ? "border-brand/40 bg-brand/[0.06]" : "border-border bg-background/60"
      }`}
    >
      <div className="text-foreground/55 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase">
        {icon}
        {label}
      </div>
      <p className="font-display text-foreground mt-1 text-2xl font-bold tabular-nums">
        {value === null ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
}
