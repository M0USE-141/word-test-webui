/**
 * Auth Screen Module
 * Handles user authentication UI and logic.
 */

import { t } from "../i18n.js";
import { clearTestsCache, dom, state } from "../state.js";
import {
  checkAuth,
  login,
  logout,
  register,
  getStoredUser,
  isAuthenticated,
} from "../api/auth.js";

let currentAuthTab = "login";

/**
 * Initialize auth screen event listeners.
 */
export function initializeAuthScreenEvents() {
  console.log("[Auth] Initializing auth events...");
  console.log("[Auth] DOM elements:", {
    authLoginTab: dom.authLoginTab,
    authRegisterTab: dom.authRegisterTab,
    authLoginForm: dom.authLoginForm,
    authRegisterForm: dom.authRegisterForm,
  });

  // Tab switching
  if (dom.authLoginTab) {
    dom.authLoginTab.addEventListener("click", () => {
      console.log("[Auth] Login tab clicked");
      switchAuthTab("login");
    });
  }
  if (dom.authRegisterTab) {
    dom.authRegisterTab.addEventListener("click", () => {
      console.log("[Auth] Register tab clicked");
      switchAuthTab("register");
    });
  }

  // Form submissions
  dom.authLoginForm?.addEventListener("submit", handleLogin);
  dom.authRegisterForm?.addEventListener("submit", handleRegister);

  console.log("[Auth] Auth events initialized");
}

/**
 * Switch between login and register tabs.
 * @param {"login" | "register"} tab
 */
export function switchAuthTab(tab) {
  currentAuthTab = tab;

  // Update tab buttons
  if (dom.authLoginTab) {
    dom.authLoginTab.classList.toggle("is-active", tab === "login");
  }
  if (dom.authRegisterTab) {
    dom.authRegisterTab.classList.toggle("is-active", tab === "register");
  }

  // Update forms visibility
  if (dom.authLoginForm) {
    dom.authLoginForm.classList.toggle("is-hidden", tab !== "login");
  }
  if (dom.authRegisterForm) {
    dom.authRegisterForm.classList.toggle("is-hidden", tab !== "register");
  }

  // Clear status
  clearAuthStatus();
}

/**
 * Handle login form submission.
 * @param {Event} event
 */
async function handleLogin(event) {
  event.preventDefault();

  const username = dom.authLoginUsername?.value?.trim();
  const password = dom.authLoginPassword?.value;

  if (!username || !password) {
    showAuthStatus(t("authError"), true);
    return;
  }

  setAuthLoading(true);
  clearAuthStatus();

  try {
    await login(username, password);
    const user = await checkAuth();

    if (user) {
      state.currentUser = user;
      onAuthSuccess(user);
    } else {
      showAuthStatus(t("authError"), true);
    }
  } catch (error) {
    showAuthStatus(error.message || t("authError"), true);
  } finally {
    setAuthLoading(false);
  }
}

/**
 * Handle register form submission.
 * @param {Event} event
 */
async function handleRegister(event) {
  event.preventDefault();

  const username = dom.authRegisterUsername?.value?.trim();
  const email = dom.authRegisterEmail?.value?.trim();
  const password = dom.authRegisterPassword?.value;
  const confirmPassword = dom.authRegisterConfirmPassword?.value;

  if (!username || !email || !password || !confirmPassword) {
    showAuthStatus(t("authError"), true);
    return;
  }

  if (password !== confirmPassword) {
    showAuthStatus(t("passwordMismatch"), true);
    return;
  }

  setAuthLoading(true);
  clearAuthStatus();

  try {
    await register(username, email, password);
    showAuthStatus(t("registerSuccess"), false);
    // Switch to login tab
    switchAuthTab("login");
    // Pre-fill username
    if (dom.authLoginUsername) {
      dom.authLoginUsername.value = username;
    }
  } catch (error) {
    showAuthStatus(error.message || t("authError"), true);
  } finally {
    setAuthLoading(false);
  }
}

/**
 * Handle logout.
 */
async function handleLogout() {
  try {
    await logout();
  } catch {
    // Ignore logout errors
  }
  state.currentUser = null;
  onLogout();
}

/**
 * Show auth status message.
 * @param {string} message
 * @param {boolean} isError
 */
function showAuthStatus(message, isError = false) {
  if (dom.authStatus) {
    dom.authStatus.textContent = message;
    dom.authStatus.classList.toggle("is-error", isError);
    dom.authStatus.classList.toggle("is-success", !isError);
    dom.authStatus.classList.remove("is-hidden");
  }
}

/**
 * Clear auth status message.
 */
function clearAuthStatus() {
  if (dom.authStatus) {
    dom.authStatus.textContent = "";
    dom.authStatus.classList.add("is-hidden");
    dom.authStatus.classList.remove("is-error", "is-success");
  }
}

/**
 * Set auth loading state.
 * @param {boolean} loading
 */
function setAuthLoading(loading) {
  const buttons = [
    dom.authLoginButton,
    dom.authRegisterButton,
  ].filter(Boolean);

  buttons.forEach((button) => {
    button.disabled = loading;
  });

  if (dom.authScreen) {
    dom.authScreen.classList.toggle("is-loading", loading);
  }
}

/**
 * Render auth screen.
 */
export function renderAuthScreen() {
  if (dom.screenAuth) {
    dom.screenAuth.classList.remove("is-hidden");
    dom.screenAuth.classList.add("is-active");
  }
  if (dom.screenManagement) {
    dom.screenManagement.classList.add("is-hidden");
    dom.screenManagement.classList.remove("is-active");
  }
  if (dom.screenTesting) {
    dom.screenTesting.classList.add("is-hidden");
    dom.screenTesting.classList.remove("is-active");
  }
  if (dom.screenStats) {
    dom.screenStats.classList.add("is-hidden");
    dom.screenStats.classList.remove("is-active");
  }
  if (dom.screenProfile) {
    dom.screenProfile.classList.add("is-hidden");
    dom.screenProfile.classList.remove("is-active");
  }
}

/**
 * Hide auth screen.
 */
export function hideAuthScreen() {
  if (dom.screenAuth) {
    dom.screenAuth.classList.add("is-hidden");
    dom.screenAuth.classList.remove("is-active");
  }
}

/**
 * Update user display in header.
 * @param {object|null} user
 */
export function updateUserDisplay(user) {
  if (dom.userChip) {
    dom.userChip.classList.toggle("is-hidden", !user);
  }
  if (dom.userDisplay) {
    if (user) {
      // Show display_name if available, otherwise username
      dom.userDisplay.textContent = user.display_name || user.username;
      dom.userDisplay.classList.remove("is-hidden");
    } else {
      dom.userDisplay.textContent = "";
      dom.userDisplay.classList.add("is-hidden");
    }
  }
  if (dom.userAvatarImage && dom.userAvatarInitials) {
    if (user?.avatar_url) {
      dom.userAvatarImage.src = `${user.avatar_url}?t=${Date.now()}`;
      dom.userAvatarImage.classList.remove("is-hidden");
      dom.userAvatarInitials.textContent = "";
    } else if (user) {
      dom.userAvatarImage.src = "";
      dom.userAvatarImage.classList.add("is-hidden");
      const name = user.display_name || user.username || "";
      dom.userAvatarInitials.textContent = getInitials(name);
    } else {
      dom.userAvatarImage.src = "";
      dom.userAvatarImage.classList.add("is-hidden");
      dom.userAvatarInitials.textContent = "";
    }
  }
  if (dom.userMenu) {
    dom.userMenu.classList.add("is-hidden");
  }
  if (dom.userMenuToggle) {
    dom.userMenuToggle.setAttribute("aria-expanded", "false");
  }
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Called when auth is successful.
 * @param {object} user
 */
function onAuthSuccess(user) {
  hideAuthScreen();
  updateUserDisplay(user);
  // Clear tests cache to reload with new user's access
  clearTestsCache();
  // Trigger app initialization or screen change
  if (typeof window.onAuthSuccess === "function") {
    window.onAuthSuccess(user);
  }
}

/**
 * Called when user logs out.
 */
function onLogout() {
  updateUserDisplay(null);
  // Clear tests cache so next user gets fresh data
  clearTestsCache();
  renderAuthScreen();
  // Clear forms
  if (dom.authLoginForm) {
    dom.authLoginForm.reset();
  }
  if (dom.authRegisterForm) {
    dom.authRegisterForm.reset();
  }
  clearAuthStatus();
}

/**
 * Check authentication on app load.
 * @returns {Promise<object|null>}
 */
export async function checkAuthOnLoad() {
  if (!isAuthenticated()) {
    return null;
  }

  try {
    const user = await checkAuth();
    if (user) {
      state.currentUser = user;
      updateUserDisplay(user);
      return user;
    }
  } catch {
    // Token invalid, clear it
  }

  return null;
}

/**
 * Get current authenticated user.
 * @returns {object|null}
 */
export function getCurrentUser() {
  return state.currentUser || getStoredUser();
}

export { handleLogout };
