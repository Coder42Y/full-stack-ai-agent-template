"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  Cpu,
  Database,
  Lock,
  Settings2,
  Sliders,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { useKnowledgeBases, useConversations } from "@/hooks";
import { useConversationStore, useKBSelectionStore } from "@/stores";
import { cn } from "@/lib/utils";
import type { KBScope, KnowledgeBase } from "@/types";

type ThinkingEffort = "off" | "low" | "medium" | "high";
type Tab = "kb" | "model" | "settings";

interface ChatControlsProps {
  onModelChange?: (model: string | null) => void;
  onTemperatureChange?: (value: number | null) => void;
  onThinkingEffortChange?: (value: "low" | "medium" | "high" | null) => void;
}

const SCOPE_META: Record<KBScope, { labelKey: string; icon: LucideIcon }> = {
  personal: { labelKey: "scope.personal", icon: Lock },
  org: { labelKey: "scope.org", icon: Users },
  app: { labelKey: "scope.app", icon: Sparkles },
};

const SECTION_ORDER: KBScope[] = ["personal", "org", "app"];

const EFFORT_OPTIONS: { labelKey: string; hintKey: string; value: ThinkingEffort }[] = [
  { labelKey: "settings.effortOff", value: "off", hintKey: "settings.effortOffHint" },
  { labelKey: "settings.effortLow", value: "low", hintKey: "settings.effortLowHint" },
  { labelKey: "settings.effortMedium", value: "medium", hintKey: "settings.effortMediumHint" },
  { labelKey: "settings.effortHigh", value: "high", hintKey: "settings.effortHighHint" },
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
  const t = useTranslations("chat");
  const [tab, setTab] = useState<Tab>("kb");

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

  // ── Model state ─────────────────────────────────────────────────────────
  const [defaultModelName, setDefaultModelName] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([
    { value: "", label: "" },
  ]);
  const [selectedModel, setSelectedModel] = useState<{ value: string; label: string }>({
    value: "",
    label: "",
  });

  useEffect(() => {
    // Fetch model list once on mount. `onModelChange` is intentionally NOT in
    // deps — parents (use-chat) pass an inline arrow each render, so depending
    // on it triggers a refetch every render → infinite loop during streaming.
    fetch("/api/v1/agent/models", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models) {
          const models = [
            { value: "", label: "" },
            ...data.models.map((m: string) => ({ value: m, label: m })),
          ];
          setDefaultModelName(typeof data.default === "string" ? data.default : null);
          setAvailableModels(models);
          setSelectedModel(models[0]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Settings state ──────────────────────────────────────────────────────
  const [temperature, setTemperature] = useState<number | null>(null);
  const [effort, setEffort] = useState<ThinkingEffort>("off");
  const settingsOverridden = temperature !== null || effort !== "off";

  // ── Trigger summary ─────────────────────────────────────────────────────
  const triggerSummary = useMemo(() => {
    const parts: string[] = [];
    if (activeCount > 0) parts.push(t("controls.activeKB", { count: activeCount }));
    if (selectedModel.value) parts.push(selectedModel.value);
    if (settingsOverridden) parts.push(t("controls.triggerCustom"));
    return parts.length ? parts.join(" · ") : t("controls.triggerDefault");
  }, [activeCount, selectedModel, settingsOverridden, t]);

  const hasOverrides = activeCount > 0 || selectedModel.value !== "" || settingsOverridden;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("controls.ariaLabel")}
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
              style={{ boxShadow: "0 0 6px var(--color-brand)" }}
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
          style={{
            background:
              "radial-gradient(circle, oklch(from var(--color-brand) l c h / 0.25), transparent 65%)",
          }}
        />

        {/* Tabs */}
        <div className="border-foreground/10 flex items-center gap-1 border-b p-2">
          <TabButton
            icon={Database}
            label={t("controls.tabKb")}
            active={tab === "kb"}
            onClick={() => setTab("kb")}
          />
          {onModelChange && (
            <TabButton
              icon={Cpu}
              label={t("controls.tabModel")}
              active={tab === "model"}
              onClick={() => setTab("model")}
            />
          )}
          {onTemperatureChange && onThinkingEffortChange && (
            <TabButton
              icon={Settings2}
              label={t("controls.tabSettings")}
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          )}
        </div>

        {/* Body */}
        <div className="max-h-[420px] scrollbar-thin overflow-y-auto p-4">
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
          {tab === "model" && (
            <ModelPanel
              models={availableModels}
              selected={selectedModel}
              defaultModelName={defaultModelName}
              onPick={(m) => {
                setSelectedModel(m);
                onModelChange?.(m.value || null);
              }}
            />
          )}
          {tab === "settings" && (
            <SettingsPanel
              temperature={temperature}
              effort={effort}
              onTemperatureChange={(v) => {
                setTemperature(v);
                onTemperatureChange?.(v);
              }}
              onEffortChange={(v) => {
                setEffort(v);
                onThinkingEffortChange?.(v === "off" ? null : v);
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
              style={{ boxShadow: "0 0 6px var(--color-brand)" }}
            />
            {currentConversationId ? t("controls.savedForChat") : t("controls.savesOnSend")}
          </span>
          <span>{t("controls.escToClose")}</span>
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
  const t = useTranslations("chat");
  const activeCount = activeIds.size;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-foreground text-sm font-semibold">{t("kb.title")}</p>
        <span className="text-foreground/55 font-mono text-[10px] tabular-nums">
          {t("kb.active", { active: activeCount, total: kbs.length })}
        </span>
      </div>
      <p className="text-foreground/55 mb-4 text-xs leading-relaxed">{t("kb.searchHint")}</p>

      {isLoading && kbs.length === 0 ? (
        <p className="text-foreground/55 py-3 text-xs">{t("kb.loading")}</p>
      ) : kbs.length === 0 ? (
        <div className="border-foreground/10 bg-foreground/[0.02] rounded-xl border px-4 py-6 text-center">
          <Database className="text-foreground/30 mx-auto mb-2 h-6 w-6" />
          <p className="text-foreground/65 text-xs">{t("kb.empty")}</p>
          <p className="text-foreground/45 mt-1 text-[11px]">{t("kb.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((scope) => {
            const meta = SCOPE_META[scope];
            return (
              <section key={scope}>
                <div className="text-foreground/55 mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
                  <meta.icon className="h-3 w-3" />
                  {t(meta.labelKey)}
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
          {t("kb.draftSelection")}
        </p>
      )}
    </div>
  );
}

/** Model picker panel. */
function ModelPanel({
  models,
  selected,
  defaultModelName,
  onPick,
}: {
  models: { value: string; label: string }[];
  selected: { value: string; label: string };
  defaultModelName: string | null;
  onPick: (m: { value: string; label: string }) => void;
}) {
  const t = useTranslations("chat");
  return (
    <div>
      <p className="text-foreground mb-1 text-sm font-semibold">{t("model.title")}</p>
      <p className="text-foreground/55 mb-4 text-xs leading-relaxed">{t("model.desc")}</p>
      <ul className="space-y-1">
        {models.map((m) => {
          const isActive = selected.value === m.value;
          const label =
            m.value === ""
              ? defaultModelName
                ? t("model.defaultWithName", { name: defaultModelName })
                : t("model.default")
              : m.label;
          return (
            <li key={m.value || "default"}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition-all",
                  isActive
                    ? "border-brand/40 bg-brand/[0.06] text-foreground"
                    : "border-foreground/10 text-foreground/75 hover:border-foreground/25 hover:bg-foreground/[0.02] hover:text-foreground",
                )}
              >
                <span className="truncate font-medium">{label}</span>
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
  onTemperatureChange,
  onEffortChange,
}: {
  temperature: number | null;
  effort: ThinkingEffort;
  onTemperatureChange: (v: number | null) => void;
  onEffortChange: (v: ThinkingEffort) => void;
}) {
  const t = useTranslations("chat");
  const currentEffort = EFFORT_OPTIONS.find((o) => o.value === effort);
  return (
    <div className="space-y-6">
      {/* Temperature */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="chat-temp" className="text-foreground text-sm font-semibold">
            {t("settings.temperature")}
          </label>
          <span className="text-foreground font-mono text-xs tabular-nums">
            {temperature === null ? (
              <span className="text-foreground/55">{t("settings.temperatureDefault")}</span>
            ) : (
              temperature.toFixed(2)
            )}
          </span>
        </div>
        <input
          id="chat-temp"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={temperature ?? 0.7}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          className="bg-foreground/15 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-brand)]"
        />
        <div className="text-foreground/45 flex justify-between font-mono text-[10px] tracking-wider uppercase">
          <span>{t("settings.focused")}</span>
          <span>{t("settings.creative")}</span>
        </div>
        {temperature !== null && (
          <button
            type="button"
            onClick={() => onTemperatureChange(null)}
            className="text-foreground/55 hover:text-foreground text-[11px] underline-offset-2 hover:underline"
          >
            {t("settings.resetTemperature")}
          </button>
        )}
      </div>

      {/* Thinking effort */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-foreground text-sm font-semibold">{t("settings.thinkingEffort")}</span>
          <span className="text-foreground/45 text-[10px]">{t("settings.modelDependent")}</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {EFFORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onEffortChange(opt.value)}
              className={cn(
                "rounded-lg px-2 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
                effort === opt.value
                  ? "bg-foreground text-background"
                  : "border-foreground/15 text-foreground/55 hover:text-foreground border",
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        <p className="text-foreground/55 text-[11px]">{currentEffort ? t(currentEffort.hintKey) : null}</p>
      </div>

      <p className="text-foreground/45 text-[10px] leading-relaxed">{t("settings.persistHint")}</p>
    </div>
  );
}
