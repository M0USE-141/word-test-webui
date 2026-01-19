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

export function setupThemeToggle(toggleElement) {
  if (!toggleElement) return;

  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const current = applyThemePreference(saved || DEFAULT_THEME);

  // Set initial checkbox state
  if (toggleElement.type === "checkbox") {
    toggleElement.checked = current === "dark";
    toggleElement.addEventListener("change", () => {
      applyThemePreference(toggleElement.checked ? "dark" : "light");
    });
  } else {
    toggleElement.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      applyThemePreference(isDark ? "light" : "dark");
    });
  }
}

export function getStoredTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
}
