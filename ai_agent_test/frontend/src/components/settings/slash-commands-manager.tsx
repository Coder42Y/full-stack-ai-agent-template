"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ApiError } from "@/lib/api-client";
import { BUILTIN_COMMAND_LIST, isBuiltinEnabled, useSlashCommands } from "@/hooks";
import type { UserSlashCommandRecord } from "@/lib/slash-commands-api";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function SlashCommandsManager() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const {
    records,
    isLoading,
    error,
    refresh,
    createCustom,
    updateCustom,
    setBuiltinEnabled,
    remove,
  } = useSlashCommands();

  const customs = records.filter((r) => r.prompt !== null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditingId("new");
    setDraftName("");
    setDraftPrompt("");
    setDraftEnabled(true);
  };

  const openEdit = (record: UserSlashCommandRecord) => {
    setEditingId(record.id);
    setDraftName(record.name);
    setDraftPrompt(record.prompt ?? "");
    setDraftEnabled(record.is_enabled);
  };

  const closeDialog = () => {
    if (submitting) return;
    setEditingId(null);
  };

  const handleSubmit = async () => {
    const name = draftName.trim().toLowerCase();
    const prompt = draftPrompt.trim();
    if (!NAME_PATTERN.test(name)) {
      toast.error(t("slashCommands.nameValidationError"));
      return;
    }
    if (!prompt) {
      toast.error(t("slashCommands.promptRequired"));
      return;
    }
    setSubmitting(true);
    try {
      if (editingId === "new") {
        await createCustom({ name, prompt });
        toast.success(t("slashCommands.commandCreated", { name }));
      } else if (editingId) {
        await updateCustom(editingId, { name, prompt, is_enabled: draftEnabled });
        toast.success(t("slashCommands.commandUpdated", { name }));
      }
      setEditingId(null);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("slashCommands.saveFailed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCustom = async (record: UserSlashCommandRecord, next: boolean) => {
    try {
      await updateCustom(record.id, { is_enabled: next });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("slashCommands.toggleFailed"));
    }
  };

  const handleToggleBuiltin = async (name: string, next: boolean) => {
    try {
      await setBuiltinEnabled(name, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("slashCommands.toggleFailed"));
    }
  };

  const handleDelete = async (record: UserSlashCommandRecord) => {
    if (!confirm(t("slashCommands.deleteConfirm", { name: record.name }))) return;
    try {
      await remove(record.id);
      toast.success(t("slashCommands.commandDeleted", { name: record.name }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("slashCommands.deleteFailed"));
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
          <span>{error}</span>
          <Button size="sm" variant="ghost" onClick={() => refresh()}>
            {tc("retry")}
          </Button>
        </div>
      )}

      {/* Built-in commands */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              {t("slashCommands.builtinTitle")}
            </h3>
            <p className="text-foreground/55 mt-0.5 text-xs">{t("slashCommands.builtinDescription")}</p>
          </div>
        </div>
        <ul className="border-foreground/10 divide-foreground/8 divide-y rounded-xl border">
          {BUILTIN_COMMAND_LIST.map((cmd) => {
            const enabled = isBuiltinEnabled(cmd.name, records);
            return (
              <li key={cmd.name} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <code className="text-foreground bg-foreground/8 rounded px-1.5 py-0.5 font-mono text-xs">
                      /{cmd.name}
                    </code>
                    {cmd.action.kind === "client" && (
                      <span className="text-foreground/45 font-mono text-[10px] tracking-wider uppercase">
                        {t("slashCommands.local")}
                      </span>
                    )}
                  </div>
                  <p className="text-foreground/65 mt-1 text-xs">
                    {t(`slashCommands.builtinDescriptions.${cmd.name}`)}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => handleToggleBuiltin(cmd.name, v)}
                  disabled={isLoading}
                  aria-label={t("slashCommands.toggleBuiltin", { name: cmd.name })}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/* Custom commands */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              {t("slashCommands.customTitle")}
            </h3>
            <p className="text-foreground/55 mt-0.5 text-xs">
              {t.rich("slashCommands.customDescription", {
                code: (chunks) => <code className="text-foreground/55">{chunks}</code>,
              })}
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("slashCommands.newCommand")}
          </Button>
        </div>

        {customs.length === 0 ? (
          <EmptyState
            title={t("slashCommands.emptyTitle")}
            description={t("slashCommands.emptyDescription")}
          />
        ) : (
          <ul className="border-foreground/10 divide-foreground/8 divide-y rounded-xl border">
            {customs.map((record) => (
              <li key={record.id} className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <code className="text-foreground bg-foreground/8 rounded px-1.5 py-0.5 font-mono text-xs">
                      /{record.name}
                    </code>
                  </div>
                  <p className="text-foreground/65 mt-1 line-clamp-2 text-xs">{record.prompt}</p>
                </div>
                <Switch
                  checked={record.is_enabled}
                  onCheckedChange={(v) => handleToggleCustom(record, v)}
                  aria-label={t("slashCommands.toggleCustom", { name: record.name })}
                />
                <button
                  type="button"
                  onClick={() => openEdit(record)}
                  className="text-foreground/55 hover:bg-foreground/5 hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  title={tc("edit")}
                  aria-label={tc("edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(record)}
                  className="text-foreground/55 hover:bg-destructive/10 hover:text-destructive inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  title={tc("delete")}
                  aria-label={tc("delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={editingId !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId === "new"
                ? t("slashCommands.newCustomCommand")
                : t("slashCommands.editCustomCommand", { name: draftName })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cmd-name">{t("slashCommands.nameLabel")}</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-foreground/45 font-mono text-sm">/</span>
                <Input
                  id="cmd-name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value.toLowerCase())}
                  placeholder={t("slashCommands.namePlaceholder")}
                  maxLength={32}
                  autoFocus
                />
              </div>
              <p className="text-foreground/45 mt-1 text-[11px]">{t("slashCommands.nameHint")}</p>
            </div>
            <div>
              <Label htmlFor="cmd-prompt">{t("slashCommands.promptLabel")}</Label>
              <Textarea
                id="cmd-prompt"
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                placeholder={t("slashCommands.promptPlaceholder")}
                rows={6}
                maxLength={10_000}
                className="mt-1.5 font-mono text-sm"
              />
              <p className="text-foreground/45 mt-1 text-[11px]">
                {t.rich("slashCommands.promptHint", {
                  code: (chunks) => <code className="text-foreground/55">{chunks}</code>,
                  name: draftName || "name",
                })}
              </p>
            </div>
            {editingId !== "new" && (
              <div className="flex items-center gap-3">
                <Switch id="cmd-enabled" checked={draftEnabled} onCheckedChange={setDraftEnabled} />
                <Label htmlFor="cmd-enabled" className="text-sm font-normal">
                  {t("slashCommands.enabled")}
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? tc("saving") : editingId === "new" ? tc("create") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
