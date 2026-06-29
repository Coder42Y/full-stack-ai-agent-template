"use client";

import {
  useEffect,
  useMemo,
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  useRef,
{%- endif %}
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Cpu,
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  Database,
  Lock,
{%- endif %}
  Settings2,
  Sliders,
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  Sparkles,
  Users,
{%- endif %}
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
import { Checkbox } from "@/components/ui/checkbox";
import { useKnowledgeBases, useConversations } from "@/hooks";
import { useConversationStore, useKBSelectionStore } from "@/stores";
{%- else %}
import { useConversationStore } from "@/stores";
{%- endif %}
import { cn } from "@/lib/utils";
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
import type { KBScope, KnowledgeBase } from "@/types";
{%- endif %}

type ThinkingEffort = "off" | "low" | "medium" | "high";
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
type Tab = "kb" | "model" | "settings";
{%- else %}
type Tab = "model" | "settings";
{%- endif %}

interface ChatControlsProps {
  onModelChange?: (model: string | null) => void;
  onTemperatureChange?: (value: number | null) => void;
  onThinkingEffortChange?: (value: "low" | "medium" | "high" | null) => void;
}

type ConfigStatus = "idle" | "loading" | "saving" | "saved" | "error";

interface ModelChoice {
  value: string;
  label: string;
  role?: string;
  supportsThinking?: boolean;
  supportsReasoningEffort?: boolean;
}

interface AIRuntimeConfigResponse {
  model: string;
  temperature: number | null;
  thinking_effort: ThinkingEffort;
  max_tokens: number;
  effective_model?: string;
  config_path?: string;
  models: {
    id: string;
    label: string;
    role?: string;
    supports_thinking?: boolean;
    supports_reasoning_effort?: boolean;
  }[];
}

type AIConfigPatch = Partial<{
  model: string;
  temperature: number | null;
  thinking_effort: ThinkingEffort;
  max_tokens: number;
}>;

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
const SCOPE_META: Record<KBScope, { label: string; icon: LucideIcon }> = {
  personal: { label: "个人", icon: Lock },
  org: { label: "组织", icon: Users },
  app: { label: "全局", icon: Sparkles },
};

const SECTION_ORDER: KBScope[] = ["personal", "org", "app"];
{%- endif %}

const EFFORT_OPTIONS: { label: string; value: ThinkingEffort; hint: string }[] = [
  { label: "关闭", value: "off", hint: "直接回答，不额外推理" },
  { label: "低", value: "low", hint: "快速推理" },
  { label: "中", value: "medium", hint: "平衡速度和质量" },
  { label: "高", value: "high", hint: "更深入，但会更慢" },
];

/**
 * Unified popover panel that replaces the 3 separate triggers (KB / Model /
 * Chat settings) with a single button that summarizes current state and opens
 * a tabbed control surface.
 */
export function ChatControls({
  onModelChange,
  onTemperatureChange,
  onThinkingEffortChange,
}: ChatControlsProps) {
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  const [tab, setTab] = useState<Tab>("kb");
{%- else %}
  const [tab, setTab] = useState<Tab>("model");
{%- endif %}
  const [open, setOpen] = useState(false);

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  // ── KB state ────────────────────────────────────────────────────────────
  const { kbs, isLoading: kbsLoading, fetchKBs } = useKnowledgeBases();
  // Selector-narrowed subscriptions: re-render only when these specific fields
  // change. The whole-store form re-rendered ChatControls on every conv-store
  // mutation (incl. ones unrelated to KB), which combined with the inline
  // `setModel` ref from use-chat caused an effect-driven loop during streaming.
  const currentConversationId = useConversationStore((s) => s.currentConversationId);
  const conversations = useConversationStore((s) => s.conversations);
  const { updateActiveKBs } = useConversations();
  const activeKBIds = useKBSelectionStore((s) => s.activeKBIds);
  const toggleKB = useKBSelectionStore((s) => s.toggle);
  const hydrate = useKBSelectionStore((s) => s.hydrateFromConversation);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchKBs();
  }, [fetchKBs]);

  // Hydrate from a saved conversation once per conv switch. We guard with a
  // ref so even if upstream state re-emits the same conversation object with a
  // new identity (fetch refresh, etc.), we don't re-fire `set()` and trigger
  // another render cascade.
  const lastHydratedConvRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentConversationId) {
      lastHydratedConvRef.current = null;
      return;
    }
    if (lastHydratedConvRef.current === currentConversationId) return;
    const conversation = conversations.find((c) => c.id === currentConversationId);
    if (!conversation) return;
    lastHydratedConvRef.current = currentConversationId;
    hydrate(conversation.active_knowledge_base_ids ?? null);
  }, [currentConversationId, conversations, hydrate]);

  useEffect(() => {
    const handleOpenControls = (event: Event) => {
      const nextTab = (event as CustomEvent<{ tab?: Tab }>).detail?.tab;
      if (nextTab === "model" || nextTab === "settings") {
        setTab(nextTab);
      } else {
        setTab("kb");
      }
      setOpen(true);
    };
    window.addEventListener("chat:open-controls", handleOpenControls);
    return () => window.removeEventListener("chat:open-controls", handleOpenControls);
  }, []);

  const activeIds = useMemo(() => new Set(activeKBIds), [activeKBIds]);
  const grouped = useMemo(
    () =>
      kbs.reduce<Record<KBScope, KnowledgeBase[]>>(
        (acc, kb) => {
          (acc[kb.scope] ??= []).push(kb);
          return acc;
        },
        { personal: [], org: [], app: [] },
      ),
    [kbs],
  );
  const sections = SECTION_ORDER.filter((s) => grouped[s].length > 0);
  const activeCount = activeIds.size;

  const handleKBToggle = async (kb: KnowledgeBase, checked: boolean) => {
    toggleKB(kb.id);
    if (currentConversationId) {
      const next = checked ? [...activeKBIds, kb.id] : activeKBIds.filter((id) => id !== kb.id);
      await updateActiveKBs(currentConversationId, next);
    }
  };
{%- else %}
  const { currentConversationId } = useConversationStore();
{%- endif %}

  // ── Model state ─────────────────────────────────────────────────────────
  const [availableModels, setAvailableModels] = useState<ModelChoice[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelChoice>({
    value: "",
    label: "加载中",
  });
  const [configStatus, setConfigStatus] = useState<ConfigStatus>("loading");
  const [configError, setConfigError] = useState<string | null>(null);

  const applyAIConfig = (data: AIRuntimeConfigResponse) => {
    const models =
      data.models?.map((model) => ({
        value: model.id,
        label: model.label || model.id,
        role: model.role,
        supportsThinking: model.supports_thinking,
        supportsReasoningEffort: model.supports_reasoning_effort,
      })) ?? [];
    const selected =
      models.find((model) => model.value === data.model) ??
      (data.model ? { value: data.model, label: data.model } : models[0]);

    setAvailableModels(models);
    if (selected) {
      setSelectedModel(selected);
    }
    setTemperature(data.temperature ?? null);
    setEffort(data.thinking_effort ?? "off");
  };

  const saveAIConfig = async (patch: AIConfigPatch): Promise<AIRuntimeConfigResponse | null> => {
    setConfigStatus("saving");
    setConfigError(null);
    try {
      const response = await fetch("/api/v1/agent/config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        throw new Error("Failed to update AI config");
      }
      const data = (await response.json()) as AIRuntimeConfigResponse;
      applyAIConfig(data);
      setConfigStatus("saved");
      return data;
    } catch {
      setConfigStatus("error");
      setConfigError("配置保存失败");
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setConfigStatus("loading");
    fetch("/api/v1/agent/config", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch AI config");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        applyAIConfig(data as AIRuntimeConfigResponse);
        setConfigStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigError("配置加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Settings state ──────────────────────────────────────────────────────
  const [temperature, setTemperature] = useState<number | null>(null);
  const [effort, setEffort] = useState<ThinkingEffort>("off");
  const settingsOverridden = temperature !== null || effort !== "off";

  // ── Trigger summary ─────────────────────────────────────────────────────
  const triggerSummary = useMemo(() => {
    const parts: string[] = [];
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    if (activeCount > 0) parts.push(`${activeCount} 个知识库`);
{%- endif %}
    if (selectedModel.value) parts.push(selectedModel.label);
    if (settingsOverridden) parts.push("自定义");
    return parts.length ? parts.join(" · ") : "控制";
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
  }, [activeCount, selectedModel, settingsOverridden]);
{%- else %}
  }, [selectedModel, settingsOverridden]);
{%- endif %}

  const hasOverrides =
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    activeCount > 0 || settingsOverridden || configStatus === "saving" || configStatus === "error";
{%- else %}
    settingsOverridden || configStatus === "saving" || configStatus === "error";
{%- endif %}

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-chat-settings-trigger
          aria-label="对话控制"
          className={cn(
            "border-foreground/10 bg-card hover:border-foreground/25 hover:bg-foreground/[0.04] inline-flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-2.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
            hasOverrides ? "text-foreground" : "text-foreground/65",
          )}
        >
          <Sliders className="h-3 w-3" />
          <span className="max-w-[200px] truncate">{triggerSummary}</span>
          {hasOverrides && (
            <span
              aria-hidden
              className="bg-brand inline-block h-1 w-1 rounded-full"
              {% raw %}style={{ boxShadow: "0 0 6px var(--color-brand)" }}{% endraw %}
            />
          )}
          <ChevronDown className="text-foreground/45 h-3 w-3" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="border-foreground/10 bg-card/95 relative isolate w-[380px] overflow-hidden rounded-2xl border p-0 shadow-2xl backdrop-blur-xl"
      >
        {/* Brand glow corner */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-12 -z-10 h-40 w-40 rounded-full blur-3xl"
          {% raw %}style={{
            background:
              "radial-gradient(circle, oklch(from var(--color-brand) l c h / 0.25), transparent 65%)",
          }}{% endraw %}
        />

        {/* Tabs */}
        <div className="border-foreground/10 flex items-center gap-1 border-b p-2">
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
          <TabButton icon={Database} label="KB" active={tab === "kb"} onClick={() => setTab("kb")} />
{%- endif %}
          {onModelChange && (
          <TabButton
              icon={Cpu}
              label="模型"
              active={tab === "model"}
              onClick={() => setTab("model")}
            />
          )}
          {onTemperatureChange && onThinkingEffortChange && (
            <TabButton
              icon={Settings2}
              label="设置"
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          )}
        </div>

        {/* Body */}
        <div className="max-h-[420px] scrollbar-thin overflow-y-auto p-4">
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
          {tab === "kb" && (
            <KBPanel
              sections={sections}
              grouped={grouped}
              activeIds={activeIds}
              kbs={kbs}
              isLoading={kbsLoading}
              currentConversationId={currentConversationId}
              onToggle={handleKBToggle}
            />
          )}
{%- endif %}
          {tab === "model" && (
            <ModelPanel
              models={availableModels}
              selected={selectedModel}
              isLoading={configStatus === "loading"}
              isSaving={configStatus === "saving"}
              error={configError}
              onPick={async (m) => {
                const data = await saveAIConfig({ model: m.value });
                if (data) {
                  onModelChange?.(data.model);
                }
              }}
            />
          )}
          {tab === "settings" && (
            <SettingsPanel
              temperature={temperature}
              effort={effort}
              isSaving={configStatus === "saving"}
              onTemperatureChange={(v) => {
                setTemperature(v);
                onTemperatureChange?.(v);
              }}
              onTemperatureCommit={(v) => {
                void saveAIConfig({ temperature: v });
              }}
              onEffortChange={(v) => {
                setEffort(v);
                onThinkingEffortChange?.(v === "off" ? null : v);
                void saveAIConfig({ thinking_effort: v });
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-foreground/10 text-foreground/45 flex items-center justify-between border-t px-4 py-2 font-mono text-[10px] tracking-wider uppercase">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="bg-brand inline-block h-1 w-1 animate-pulse rounded-full"
              {% raw %}style={{ boxShadow: "0 0 6px var(--color-brand)" }}{% endraw %}
            />
            {configStatus === "loading"
              ? "加载 AI 配置"
              : configStatus === "saving"
                ? "保存 AI 配置"
                : configStatus === "error"
                  ? (configError ?? "AI 配置异常")
                  : "AI 配置已同步"}
          </span>
          <span>Esc 关闭</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
/** Knowledge bases panel — grouped by scope. */
function KBPanel({
  sections,
  grouped,
  activeIds,
  kbs,
  isLoading,
  currentConversationId,
  onToggle,
}: {
  sections: KBScope[];
  grouped: Record<KBScope, KnowledgeBase[]>;
  activeIds: Set<string>;
  kbs: KnowledgeBase[];
  isLoading: boolean;
  currentConversationId: string | null;
  onToggle: (kb: KnowledgeBase, checked: boolean) => void;
}) {
  const activeCount = activeIds.size;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-foreground text-sm font-semibold">知识库</p>
        <span className="text-foreground/55 font-mono text-[10px] tabular-nums">
          已选 {activeCount}/{kbs.length}
        </span>
      </div>
      <p className="text-foreground/55 mb-4 text-xs leading-relaxed">
        发送消息时会检索已选需求知识库，并把来源带入回答。
      </p>

      {isLoading && kbs.length === 0 ? (
        <p className="text-foreground/55 py-3 text-xs">加载中...</p>
      ) : kbs.length === 0 ? (
        <div className="border-foreground/10 bg-foreground/[0.02] rounded-xl border px-4 py-6 text-center">
          <Database className="text-foreground/30 mx-auto mb-2 h-6 w-6" />
          <p className="text-foreground/65 text-xs">还没有需求知识库。</p>
          <p className="text-foreground/45 mt-1 text-[11px]">
            请先在需求项目页面创建一个项目。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((scope) => {
            const meta = SCOPE_META[scope];
            return (
              <section key={scope}>
                <div className="text-foreground/55 mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
                  <meta.icon className="h-3 w-3" />
                  {meta.label}
                </div>
                <ul className="space-y-1">
                  {grouped[scope].map((kb) => {
                    const isActive = activeIds.has(kb.id);
                    return (
                      <li key={kb.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-all",
                            isActive
                              ? "border-brand/40 bg-brand/[0.06]"
                              : "border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.02]",
                          )}
                        >
                          <Checkbox
                            checked={isActive}
                            onCheckedChange={(c) => onToggle(kb, c as boolean)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-xs font-medium">
                              {kb.name}
                            </p>
                            {kb.description && (
                              <p className="text-foreground/55 mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
                                {kb.description}
                              </p>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {!currentConversationId && kbs.length > 0 && (
        <p className="text-foreground/45 mt-4 font-mono text-[10px] tracking-wider uppercase">
          草稿选择会在发送后保存。
        </p>
      )}
    </div>
  );
}
{%- endif %}

/** Model picker panel. */
function ModelPanel({
  models,
  selected,
  isLoading,
  isSaving,
  error,
  onPick,
}: {
  models: ModelChoice[];
  selected: ModelChoice;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onPick: (m: ModelChoice) => void | Promise<void>;
}) {
  if (isLoading) {
    return <p className="text-foreground/55 py-3 text-xs">加载模型配置...</p>;
  }

  return (
    <div>
      <p className="text-foreground mb-1 text-sm font-semibold">默认模型</p>
      <p className="text-foreground/55 mb-4 text-xs leading-relaxed">
        选择后会写入后端运行配置，下一轮回复使用该 GLM 模型。
      </p>
      {error && <p className="text-destructive mb-3 text-xs">{error}</p>}
      {models.length === 0 && (
        <p className="text-foreground/55 py-3 text-xs">没有可用模型配置。</p>
      )}
      <ul className="space-y-1">
        {models.map((m) => {
          const isActive = selected.value === m.value;
          return (
            <li key={m.value}>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onPick(m)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition-all",
                  isActive
                    ? "border-brand/40 bg-brand/[0.06] text-foreground"
                    : "border-foreground/10 text-foreground/75 hover:border-foreground/25 hover:bg-foreground/[0.02] hover:text-foreground",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.label}</span>
                  {m.role && (
                    <span className="text-foreground/45 mt-0.5 block font-mono text-[10px] uppercase">
                      {m.role}
                    </span>
                  )}
                </span>
                {isActive && <Check className="text-brand h-3.5 w-3.5 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Chat settings panel — temperature + thinking effort. */
function SettingsPanel({
  temperature,
  effort,
  isSaving,
  onTemperatureChange,
  onTemperatureCommit,
  onEffortChange,
}: {
  temperature: number | null;
  effort: ThinkingEffort;
  isSaving: boolean;
  onTemperatureChange: (v: number | null) => void;
  onTemperatureCommit: (v: number | null) => void;
  onEffortChange: (v: ThinkingEffort) => void;
}) {
  const commitFromInput = (value: string) => {
    onTemperatureCommit(parseFloat(value));
  };

  return (
    <div className="space-y-6">
      {/* Temperature */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="chat-temp" className="text-foreground text-sm font-semibold">
            随机性
          </label>
          <span className="text-foreground font-mono text-xs tabular-nums">
            {temperature === null ? (
              <span className="text-foreground/55">默认</span>
            ) : (
              temperature.toFixed(2)
            )}
          </span>
        </div>
        <input
          id="chat-temp"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={temperature ?? 0.7}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          onMouseUp={(e) => commitFromInput(e.currentTarget.value)}
          onTouchEnd={(e) => commitFromInput(e.currentTarget.value)}
          onBlur={(e) => commitFromInput(e.currentTarget.value)}
          disabled={isSaving}
          className="bg-foreground/15 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-brand)]"
        />
        <div className="text-foreground/45 flex justify-between font-mono text-[10px] tracking-wider uppercase">
          <span>稳健</span>
          <span>发散</span>
        </div>
        {temperature !== null && (
          <button
            type="button"
            onClick={() => {
              onTemperatureChange(null);
              onTemperatureCommit(null);
            }}
            className="text-foreground/55 hover:text-foreground text-[11px] underline-offset-2 hover:underline"
          >
            恢复服务端默认
          </button>
        )}
      </div>

      {/* Thinking effort */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-foreground text-sm font-semibold">推理强度</span>
          <span className="text-foreground/45 text-[10px]">取决于模型</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {EFFORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={isSaving}
              onClick={() => onEffortChange(opt.value)}
              className={cn(
                "rounded-lg px-2 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
                effort === opt.value
                  ? "bg-foreground text-background"
                  : "border-foreground/15 text-foreground/55 hover:text-foreground border",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-foreground/55 text-[11px]">
          {EFFORT_OPTIONS.find((o) => o.value === effort)?.hint}
        </p>
      </div>

      <p className="text-foreground/45 text-[10px] leading-relaxed">
        设置会写入后端运行配置 JSON，并影响后续 AI 回复。
      </p>
    </div>
  );
}
