/**
 * Main Application Entry Point
 * Refactored into modular structure
 */

import { fetchTests } from "./api.js";
import { defaultLocale } from "./i18n.js";
import {
  renderAuthScreen,
  renderManagementScreen,
  renderQuestion,
  renderQuestionNav,
  renderResultSummary,
  setActiveScreen,
  updateProgressHint,
} from "./rendering.js";
import { initTelemetry } from "./telemetry.js";
import { dom, loadLastResult, state } from "./state.js";

// Import utilities
import { applyLocale, getStoredLocale } from "./utils/locale.js";
import { setupThemeToggle, getStoredTheme, applyThemePreference } from "./utils/theme.js";

// Import screen modules
import {
  initializeManagementScreenEvents,
  renderTestCardsWithHandlers,
  selectTest,
  updateSettingsTestTitle,
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
  handleLogout,
} from "./screens/auth.js";
import {
  initializeProfileScreenEvents,
  navigateToProfile,
} from "./screens/profile.js";

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
    const { tests } = await fetchTests();
    state.testsCache = tests;
    if (!tests.length) {
      renderTestCardsWithHandlers(tests);
      await selectTest(null);
      return;
    }

    renderTestCardsWithHandlers(tests, tests[0].id);
    await selectTest(tests[0].id);
    if (state.session) {
      setActiveScreen("testing");
      setActiveTestingPanel("settings");
      renderQuestion();
    }
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
  initializeProfileScreenEvents();
  console.log("[App] Screen events initialized");

  // Profile button handler
  const toggleUserMenu = (event) => {
    event.stopPropagation();
    const isOpen = !dom.userMenu?.classList.contains("is-hidden");
    dom.userMenu?.classList.toggle("is-hidden", isOpen);
    dom.userMenuToggle?.setAttribute("aria-expanded", String(!isOpen));
  };

  dom.userMenuToggle?.addEventListener("click", toggleUserMenu);
  dom.userMenuToggle?.addEventListener("touchstart", toggleUserMenu);

  document.addEventListener("click", (event) => {
    if (
      dom.userMenu &&
      dom.userMenuToggle &&
      !dom.userMenu.classList.contains("is-hidden")
    ) {
      const target = event.target;
      if (
        target instanceof Node &&
        !dom.userMenu.contains(target) &&
        !dom.userMenuToggle.contains(target)
      ) {
        dom.userMenu.classList.add("is-hidden");
        dom.userMenuToggle.setAttribute("aria-expanded", "false");
      }
    }
  });

  dom.userMenuItems?.forEach((item) => {
    item.addEventListener("click", async () => {
      const action = item.dataset.action;
      dom.userMenu?.classList.add("is-hidden");
      dom.userMenuToggle?.setAttribute("aria-expanded", "false");
      if (action === "profile") {
        navigateToProfile();
      } else if (action === "stats") {
        const { openStatsScreen } = await import("./screens/statistics.js");
        await openStatsScreen(state.currentTest?.id || null);
      } else if (action === "logout") {
        await handleLogout();
      }
    });
  });

  // Listen for profile updates to refresh user display
  window.addEventListener("profileUpdated", (event) => {
    const profile = event.detail;
    if (profile) {
      state.currentUser = {
        ...state.currentUser,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      };
      updateUserDisplay(state.currentUser);
    }
  });

  // Setup language selector
  dom.langSelect?.addEventListener("change", (event) => {
    console.log("[App] Language changed to:", event.target.value);
    applyLocale(event.target.value, state, dom);
    updateTestingPanelsStatus();
    updateSettingsTestTitle();
    if (state.session) {
      renderQuestion();
      renderQuestionNav();
    }
    if (state.currentTest) {
      renderResultSummary(loadLastResult(state.currentTest.id));
      updateProgressHint();
    }
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
