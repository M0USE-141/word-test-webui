/**
 * Auth API client for user authentication.
 */

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

/**
 * Get stored auth token.
 * @returns {string|null}
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Set auth token in localStorage.
 * @param {string} token
 */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove auth token from localStorage.
 */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Get stored user info.
 * @returns {object|null}
 */
export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Store user info in localStorage.
 * @param {object} user
 */
export function setStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Get authorization headers for API requests.
 * @returns {object}
 */
export function getAuthHeaders() {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Register a new user.
 * @param {string} username
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function register(username, email, password) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || "Registration failed");
  }

  return data;
}

/**
 * Login user and store token.
 * @param {string} username - Username or email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function login(username, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || "Login failed");
  }

  setToken(data.access_token);
  return data;
}

/**
 * Logout user and clear token.
 * @returns {Promise<void>}
 */
export async function logout() {
  const token = getToken();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore errors during logout
    }
  }
  clearToken();
}

/**
 * Get current user info.
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;

  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      return null;
    }
    throw new Error("Failed to get user info");
  }

  const user = await response.json();
  setStoredUser(user);
  return user;
}

/**
 * Refresh the access token.
 * @returns {Promise<object>}
 */
export async function refreshToken() {
  const token = getToken();
  if (!token) {
    throw new Error("No token to refresh");
  }

  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    clearToken();
    throw new Error(data?.detail || "Token refresh failed");
  }

  setToken(data.access_token);
  return data;
}

/**
 * Check if user is authenticated.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!getToken();
}

/**
 * Check token and get user on app load.
 * @returns {Promise<object|null>}
 */
export async function checkAuth() {
  if (!isAuthenticated()) {
    return null;
  }

  try {
    return await getCurrentUser();
  } catch {
    clearToken();
    return null;
  }
}
