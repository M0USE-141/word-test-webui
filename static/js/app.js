/**
 * Main Application Entry Point
 * Refactored into modular structure
 */

import { fetchTests } from "./api.js";
import { defaultLocale } from "./i18n.js";
import { renderManagementScreen } from "./rendering.js";
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

/**
 * Initialize application
 */
async function initialize() {
  // Apply saved locale
  const storedLocale = getStoredLocale() || defaultLocale;
  applyLocale(storedLocale, state, dom);

  // Apply saved theme
  const storedTheme = getStoredTheme();
  applyThemePreference(storedTheme);
  setupThemeToggle(dom.themeToggle);

  // Initialize telemetry
  initTelemetry();

  // Initialize screen event listeners
  initializeManagementScreenEvents();
  initializeTestingScreenEvents();
  initializeStatsScreenEvents();

  // Render initial state
  renderManagementScreen();
  updateTestingPanelsStatus();
  setActiveTestingPanel("settings");

  // Setup language selector
  dom.langSelect?.addEventListener("change", (event) => {
    applyLocale(event.target.value, state, dom);
  });

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
    dom.questionContainer.textContent = error.message;
  }
}

// Start application
initialize();
