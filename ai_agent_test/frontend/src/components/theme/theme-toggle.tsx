"use client";

import { Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  variant?: "icon" | "dropdown";
  className?: string;
}

export function ThemeToggle({ variant = "icon", className }: ThemeToggleProps) {
  const t = useTranslations("common");
  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        aria-label={t("lightThemeEnabled")}
        title={t("lightThemeEnabled")}
      >
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      <Button variant="default" size="icon" aria-label={t("lightMode")} title={t("lightMode")}>
        <Sun className="h-4 w-4" />
      </Button>
    </div>
  );
}
