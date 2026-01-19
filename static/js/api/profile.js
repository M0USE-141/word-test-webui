/**
 * Profile API client for user profile management.
 */

import { getAuthHeaders, clearToken } from "./auth.js";

/**
 * Handle API response and throw on error.
 * @param {Response} response
 * @returns {Promise<object>}
 */
async function handleResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      window.location.reload();
      throw new Error("Session expired");
    }
    throw new Error(data?.detail || "Request failed");
  }

  return data;
}

/**
 * Get current user profile.
 * @returns {Promise<object>}
 */
export async function getProfile() {
  const response = await fetch("/api/users/me/profile", {
    headers: getAuthHeaders(),
  });

  return handleResponse(response);
}

/**
 * Update user profile.
 * @param {string|null} displayName
 * @returns {Promise<object>}
 */
export async function updateProfile(displayName) {
  const response = await fetch("/api/users/me/profile", {
    method: "PATCH",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ display_name: displayName }),
  });

  return handleResponse(response);
}

/**
 * Upload user avatar.
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/users/me/avatar", {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  return handleResponse(response);
}

/**
 * Delete user avatar.
 * @returns {Promise<object>}
 */
export async function deleteAvatar() {
  const response = await fetch("/api/users/me/avatar", {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return handleResponse(response);
}

/**
 * Get avatar URL for a user.
 * @param {number} userId
 * @returns {string}
 */
export function getAvatarUrl(userId) {
  return `/api/users/${userId}/avatar`;
}
