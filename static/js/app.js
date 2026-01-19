/**
 * Main Application Entry Point
 * Refactored into modular structure
 */

import { fetchTests } from "./api.js";
import { defaultLocale } from "./i18n.js";
import { renderAuthScreen, renderManagementScreen } from "./rendering.js";
import { initTelemetry } from "./telemetry.js";
import { dom, state } from "./state.js";

// Import utilities
import { applyLocale, getStoredLocale } from "./utils/locale.js";
import { setupThemeToggle, getStoredTheme, applyThemePreference } from "./utils/theme.js";

// Import screen modules
import {
  initializeManagementScreenEvents,
  renderTestCardsWithHandlers,
  selectTest,
} from "./screens/management.js";
import {
  initializeTestingScreenEvents,
  setActiveTestingPanel,
  updateTestingPanelsStatus,
} from "./screens/testing.js";
import { initializeStatsScreenEvents } from "./screens/statistics.js";
import {
  initializeAuthScreenEvents,
  checkAuthOnLoad,
  updateUserDisplay,
} from "./screens/auth.js";

/**
 * Load app content after successful auth.
 */
async function loadAppContent() {
  // Render management screen
  renderManagementScreen();
  updateTestingPanelsStatus();
  setActiveTestingPanel("settings");

  // Load initial tests
  try {
    const tests = await fetchTests();
    if (!tests.length) {
      renderTestCardsWithHandlers(tests);
      await selectTest(null);
      return;
    }

    renderTestCardsWithHandlers(tests, tests[0].id);
    await selectTest(tests[0].id);
  } catch (error) {
    if (dom.questionContainer) {
      dom.questionContainer.textContent = error.message;
    }
  }
}

/**
 * Initialize application
 */
async function initialize() {
  console.log("[App] Initializing...");
  console.log("[App] DOM elements:", {
    themeToggle: dom.themeToggle,
    langSelect: dom.langSelect,
    authLoginTab: dom.authLoginTab,
    authRegisterTab: dom.authRegisterTab,
  });

  // Apply saved locale
  const storedLocale = getStoredLocale() || defaultLocale;
  applyLocale(storedLocale, state, dom);
  console.log("[App] Locale applied:", storedLocale);

  // Apply saved theme
  const storedTheme = getStoredTheme();
  applyThemePreference(storedTheme);
  setupThemeToggle(dom.themeToggle);
  console.log("[App] Theme applied:", storedTheme);

  // Initialize telemetry
  initTelemetry();

  // Initialize screen event listeners
  console.log("[App] Initializing auth screen events...");
  initializeAuthScreenEvents();
  initializeManagementScreenEvents();
  initializeTestingScreenEvents();
  initializeStatsScreenEvents();
  console.log("[App] Screen events initialized");

  // Setup language selector
  dom.langSelect?.addEventListener("change", (event) => {
    console.log("[App] Language changed to:", event.target.value);
    applyLocale(event.target.value, state, dom);
  });

  // Check authentication status
  console.log("[App] Checking auth...");
  try {
    const user = await checkAuthOnLoad();
    console.log("[App] Auth check result:", user);

    if (user) {
      // User is authenticated, load app content
      state.currentUser = user;
      updateUserDisplay(user);
      await loadAppContent();
    } else {
      // User is not authenticated, show auth screen
      console.log("[App] Showing auth screen");
      renderAuthScreen();
    }
  } catch (error) {
    console.error("[App] Auth check error:", error);
    renderAuthScreen();
  }

  console.log("[App] Initialization complete");
}

/**
 * Called when user successfully authenticates.
 * Exposed globally for auth screen callback.
 */
window.onAuthSuccess = async function (user) {
  state.currentUser = user;
  await loadAppContent();
};

// Start application
initialize();
