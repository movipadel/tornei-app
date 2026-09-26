export const ADMIN_THEME_STORAGE_KEY = "movi-admin-theme-v1";

export const ADMIN_THEME_MODES = ["light", "dark", "system"] as const;
export type AdminThemeMode = (typeof ADMIN_THEME_MODES)[number];
export type ResolvedAdminTheme = Exclude<AdminThemeMode, "system">;

export function normalizeAdminTheme(value: unknown): AdminThemeMode {
  return typeof value === "string" && ADMIN_THEME_MODES.includes(value as AdminThemeMode)
    ? (value as AdminThemeMode)
    : "system";
}

export function resolveAdminTheme(
  mode: AdminThemeMode,
  prefersDark: boolean
): ResolvedAdminTheme {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
