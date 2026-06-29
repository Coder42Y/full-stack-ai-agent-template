{% raw %}"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Mail, ShieldCheck, UserCircle } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/settings-section";
import { Button, Input, Label } from "@/components/ui";
import { useAuth } from "@/hooks";
import { apiClient, ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/stores";
import type { User } from "@/types";

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const { setUser } = useAuthStore();
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.full_name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.id, user?.email, user?.full_name]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: { email?: string; full_name?: string | null } = {};
      if (email !== user.email) payload.email = email;
      if (name !== (user.full_name ?? "")) payload.full_name = name || null;
      if (Object.keys(payload).length === 0) {
        toast.info("没有需要保存的变更");
        return;
      }
      const updated = await apiClient.patch<User>("/users/me", payload);
      setUser(updated);
      toast.success("个人资料已更新");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "更新个人资料失败");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="演示账号"
        description="MVP 阶段自动使用管理员会话进入系统；具体业务角色在需求工作台右上角切换。"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ProfileFact icon={UserCircle} label="登录账号" value={user.email} />
          <ProfileFact icon={ShieldCheck} label="系统权限" value={user.role === "admin" ? "管理员" : "成员"} />
          <ProfileFact icon={BadgeCheck} label="业务身份" value="产品 / 开发 / 测试" />
        </div>
        <p className="mt-4 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm leading-relaxed text-foreground/65">
          这里的账号只负责进入演示系统。需求录入、澄清、查询、拆解和变更确认，
          请在需求项目工作台内使用产品/开发/测试身份切换完成。
        </p>
      </SettingsSection>

      <SettingsSection
        title="基础信息"
        description="用于页面右上角展示和后续协作记录归属。"
        action={
          <Button onClick={handleSaveProfile} disabled={saving} size="sm">
            {saving ? "保存中..." : "保存变更"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-xs font-medium uppercase tracking-wider text-foreground/70">
              显示名称
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：产品负责人"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email" className="text-xs font-medium uppercase tracking-wider text-foreground/70">
              邮箱
            </Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10"
            />
            <p className="text-xs leading-relaxed text-foreground/55">
              演示环境会自动修复过期登录会话；修改邮箱不影响需求工作台里的产品/开发/测试身份。
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="下一步" description="从个人资料回到需求协作流程。">
        <div className="grid gap-3 sm:grid-cols-2">
{% endraw %}{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}{% raw %}
          <NextStep href={ROUTES.KB} label="进入需求项目" description="创建项目、录入一句话需求、回答澄清问题。" />
          <NextStep href={ROUTES.CHAT} label="打开需求对话" description="围绕需求来源进行查询、解释和变更建议。" />
{% endraw %}{%- else %}{% raw %}
          <NextStep href={ROUTES.CHAT} label="打开对话" description="围绕业务问题继续提问、追问和整理结论。" />
          <NextStep href={ROUTES.RAG} label="打开知识库" description="上传文档、检索资料，并用来源内容支撑回答。" />
{% endraw %}{%- endif %}{% raw %}
        </div>
      </SettingsSection>
    </div>
  );
}

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserCircle;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3">
      <Icon className="h-4 w-4 text-foreground/45" />
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-foreground/45">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function NextStep({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-foreground/45" />
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/55">{description}</p>
        </div>
      </div>
    </Link>
  );
}
{% endraw %}
