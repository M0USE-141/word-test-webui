/**
 * Theme management utilities
 */

const THEME_STORAGE_KEY = "ui-theme";
const DEFAULT_THEME = "light";

export function applyThemePreference(theme) {
  const resolvedTheme = theme === "dark" || theme === "light" ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  return resolvedTheme;
}

export function setupThemeToggle(toggleButton) {
  if (!toggleButton) return;

  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const current = applyThemePreference(saved || DEFAULT_THEME);

  toggleButton.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyThemePreference(isDark ? "light" : "dark");
  });
}

export function getStoredTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
}
