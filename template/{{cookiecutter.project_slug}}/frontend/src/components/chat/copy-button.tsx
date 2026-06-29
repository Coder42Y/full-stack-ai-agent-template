"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "default";
  showLabel?: boolean;
}

type CopyStatus = "idle" | "copied" | "failed";

function copyWithTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  const canUseClipboardApi =
    typeof window === "undefined" || window.isSecureContext;

  if (canUseClipboardApi && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // LAN HTTP preview pages often cannot use the Clipboard API. Fall back
      // to the old selection-based path below.
    }
  }

  return copyWithTextarea(text);
}

export function CopyButton({ text, className, size = "sm", showLabel = false }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasText = text.trim().length > 0;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasText) return;

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    const copied = await copyText(text);
    setStatus(copied ? "copied" : "failed");
    resetTimerRef.current = setTimeout(() => setStatus("idle"), 1800);

    if (!copied) {
      console.error("复制文本失败");
    }
  };

  const label =
    status === "copied" ? "已复制" : status === "failed" ? "复制失败" : "复制";
  const Icon = status === "copied" ? Check : status === "failed" ? X : Copy;

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        "text-foreground/60 hover:text-foreground border border-transparent transition-colors",
        showLabel ? "h-7 gap-1.5 px-2 text-xs" : "h-7 w-7 p-0",
        status === "copied" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
        status === "failed" && "border-destructive/20 bg-destructive/10 text-destructive",
        className,
      )}
      onClick={handleCopy}
      disabled={!hasText}
      title={hasText ? label : "暂无可复制内容"}
      aria-label={hasText ? `${label}到剪贴板` : "暂无可复制内容"}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {showLabel && <span>{label}</span>}
    </Button>
  );
}
