/**
 * Locale management utilities
 */

import { setLocale, t } from "../i18n.js";

const LOCALE_STORAGE_KEY = "ui-locale";

export function applyLocale(lang, state, dom) {
  const nextLocale = setLocale(lang);
  state.uiState.locale = nextLocale;
  document.documentElement.lang = nextLocale;
  document.title = t("pageTitle");
  localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);

  if (dom.langSelect) {
    dom.langSelect.value = nextLocale;
  }

  // Update all elements with i18n attributes
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (!key) return;
    element.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (!key) return;
    element.placeholder = t(key);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (!key) return;
    element.title = t(key);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    if (!key) return;
    element.setAttribute("aria-label", t(key));
  });

  return nextLocale;
}

export function getStoredLocale() {
  return localStorage.getItem(LOCALE_STORAGE_KEY);
}
