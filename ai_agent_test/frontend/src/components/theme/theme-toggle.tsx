"use client";

import { Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  variant?: "icon" | "dropdown";
  className?: string;
}

export function ThemeToggle({ variant = "icon", className }: ThemeToggleProps) {
  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        aria-label="Light theme enabled"
        title="Light theme enabled"
      >
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      <Button variant="default" size="icon" aria-label="Light mode" title="Light mode">
        <Sun className="h-4 w-4" />
      </Button>
    </div>
  );
}
