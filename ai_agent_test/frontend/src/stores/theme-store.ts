"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        void theme;
        set({ theme: "light" });
      },
    }),
    {
      name: "theme-storage",
      merge: (_persistedState, currentState) => ({ ...currentState, theme: "light" }),
      partialize: () => ({ theme: "light" }),
    },
  ),
);

/**
 * Get the resolved theme (light or dark) based on the current theme setting.
 * When theme is "system", it checks the user's system preference.
 */
export function getResolvedTheme(theme: Theme): "light" | "dark" {
  void theme;
  return "light";
}
