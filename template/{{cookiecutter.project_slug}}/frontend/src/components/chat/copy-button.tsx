"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "default";
}

export function CopyButton({ text, className, size = "sm" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("复制文本失败");
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn("h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100", className)}
      onClick={handleCopy}
      title={copied ? "已复制" : "复制"}
      aria-label={copied ? "已复制到剪贴板" : "复制到剪贴板"}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </Button>
  );
}
