"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, FileText, FolderOpen, HardDrive, Upload } from "lucide-react";
import { toast } from "sonner";

import { BrandIcon } from "@/components/marketing/brand-icon";
import { cn } from "@/lib/utils";

import { OnboardingShell } from "./onboarding-shell";

type Choice = "upload" | "gdrive" | "skip" | null;

export function StepData() {
  const t = useTranslations("onboarding.data");
  const tc = useTranslations("common");
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setFilename(file.name);
    // We don't actually upload here — onboarding is a UX preview.
    // The real upload UI lives in /rag. Surface a toast and continue.
    setTimeout(() => {
      setUploading(false);
      toast.success(t("queued", { name: file.name }));
    }, 600);
  };

  const handleNext = () => {
    router.push("/onboarding/team");
  };

  return (
    <OnboardingShell
      step="data"
      title={t("title")}
      description={t("description")}
    >
      <div className="grid gap-3">
        <ChoiceCard
          icon={Upload}
          title={t("upload.title")}
          description={t("upload.description")}
          selected={choice === "upload"}
          onClick={() => {
            setChoice("upload");
            fileInputRef.current?.click();
          }}
          accent
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.md,.txt"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <ChoiceCard
          brandIcon="gdrive"
          title={t("gdrive.title")}
          description={t("gdrive.description")}
          selected={choice === "gdrive"}
          onClick={() => {
            setChoice("gdrive");
            toast.info(t("gdriveConfigured"));
          }}
        />
        <ChoiceCard
          icon={HardDrive}
          title={t("skip.title")}
          description={t("skip.description")}
          selected={choice === "skip"}
          onClick={() => setChoice("skip")}
        />
      </div>

      {filename && (
        <div className="border-foreground/10 bg-foreground/[0.03] mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
          <FileText className="text-foreground/55 h-4 w-4" />
          <span className="text-foreground flex-1 truncate font-mono text-xs">{filename}</span>
          <span className="text-foreground/55 font-mono text-[11px] tracking-wider uppercase">
            {uploading ? t("queueing") : t("ready")}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={handleNext}
        className="bg-foreground text-background hover:bg-foreground/90 mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors"
      >
        {tc("continue")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </OnboardingShell>
  );
}

function ChoiceCard({
  icon: Icon,
  brandIcon,
  title,
  description,
  selected,
  onClick,
  accent,
}: {
  icon?: typeof FolderOpen;
  brandIcon?: "gdrive";
  title: string;
  description: string;
  selected?: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "lift flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-colors",
        selected
          ? "border-brand bg-brand/[0.06]"
          : "border-foreground/10 bg-card hover:border-foreground/30",
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          accent || selected ? "bg-brand text-brand-foreground" : "bg-foreground/8 text-foreground",
        )}
      >
        {Icon && <Icon className="h-5 w-5" />}
        {brandIcon && <BrandIcon name={brandIcon} className="h-5 w-5" aria-hidden />}
      </div>
      <div className="flex-1">
        <p className="text-foreground font-display text-base font-semibold">{title}</p>
        <p className="text-foreground/65 mt-0.5 text-sm">{description}</p>
      </div>
    </button>
  );
}
