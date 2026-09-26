"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ADMIN_THEME_STORAGE_KEY,
  normalizeAdminTheme,
  resolveAdminTheme,
  type AdminThemeMode,
} from "@/lib/adminTheme";

const choices = [
  { mode: "light", label: "Chiaro", icon: Sun },
  { mode: "dark", label: "Scuro", icon: Moon },
  { mode: "system", label: "Sistema", icon: Monitor },
] as const;

function applyTheme(root: HTMLElement, mode: AdminThemeMode, prefersDark: boolean) {
  root.dataset.adminThemeMode = mode;
  root.dataset.adminTheme = resolveAdminTheme(mode, prefersDark);
}

export function AdminThemeSelector() {
  const [mode, setMode] = useState<AdminThemeMode>("system");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".admin-ui");
    if (!root) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const storedMode = normalizeAdminTheme(localStorage.getItem(ADMIN_THEME_STORAGE_KEY));
    applyTheme(root, storedMode, media.matches);
    const frame = window.requestAnimationFrame(() => setMode(storedMode));

    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (root.dataset.adminThemeMode === "system") applyTheme(root, "system", event.matches);
    };
    media.addEventListener("change", handleSystemChange);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", handleSystemChange);
    };
  }, []);

  function select(nextMode: AdminThemeMode) {
    const root = document.querySelector<HTMLElement>(".admin-ui");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (root) applyTheme(root, nextMode, prefersDark);
    setMode(nextMode);
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextMode);
    } catch {
      // The active choice still works when storage is unavailable.
    }
  }

  return (
    <div className="admin-theme-selector" role="group" aria-label="Tema Admin">
      {choices.map(({ mode: choice, label, icon: Icon }) => (
        <button
          key={choice}
          type="button"
          className="admin-theme-selector__button"
          aria-label={`Tema ${label}`}
          aria-pressed={mode === choice}
          title={label}
          onClick={() => select(choice)}
        >
          <Icon size={15} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
