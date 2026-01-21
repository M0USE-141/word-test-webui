/**
 * Profile Screen Module
 * Handles user profile UI and logic.
 */

import { t } from "../i18n.js";
import { dom, state } from "../state.js";
import { setActiveScreen } from "../rendering.js";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
} from "../api/profile.js";

let currentProfile = null;

/**
 * Initialize profile screen event listeners.
 */
export function initializeProfileScreenEvents() {
  // Back button
  dom.profileBackButton?.addEventListener("click", () => {
    setActiveScreen("management");
  });

  // Display name save
  dom.profileDisplayNameSave?.addEventListener("click", handleDisplayNameUpdate);

  // Allow Enter key to save display name
  dom.profileDisplayName?.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleDisplayNameUpdate();
    }
  });

  // Avatar upload
  dom.profileAvatarInput?.addEventListener("change", handleAvatarUpload);

  // Avatar delete
  dom.profileAvatarDelete?.addEventListener("click", handleAvatarDelete);

  dom.profileEditTestButton?.addEventListener("click", handleEditTest);
  dom.profileViewStatsButton?.addEventListener("click", handleViewStats);
}

/**
 * Navigate to profile screen.
 */
export async function navigateToProfile() {
  setActiveScreen("profile");
  await loadProfileData();
  updateProfileActions();
}

/**
 * Load profile data from API.
 */
export async function loadProfileData() {
  try {
    clearProfileStatus();
    currentProfile = await getProfile();
    renderProfileData(currentProfile);
  } catch (error) {
    showProfileStatus(error.message || t("errorFetchProfile"), true);
  }
}

/**
 * Render profile data into UI.
 * @param {object} profile
 */
function renderProfileData(profile) {
  if (!profile) return;

  // Avatar
  updateAvatarDisplay(profile);

  // Display name
  if (dom.profileDisplayName) {
    dom.profileDisplayName.value = profile.display_name || "";
  }

  // Info fields
  if (dom.profileUsername) {
    dom.profileUsername.textContent = profile.username;
  }
  if (dom.profileEmail) {
    dom.profileEmail.textContent = profile.email;
  }
  if (dom.profileCreatedAt && profile.created_at) {
    const date = new Date(profile.created_at);
    dom.profileCreatedAt.textContent = date.toLocaleDateString(
      state.uiState.locale,
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );
  }

  // Update delete button visibility
  if (dom.profileAvatarDelete) {
    dom.profileAvatarDelete.classList.toggle("is-hidden", !profile.avatar_url);
  }

  updateProfileActions();
}

function updateProfileActions() {
  if (!dom.profileActiveTest) {
    return;
  }
  if (state.currentTest) {
    dom.profileActiveTest.textContent = t("profileActiveTest", {
      title: state.currentTest.title,
    });
  } else {
    dom.profileActiveTest.textContent = t("profileNoActiveTest");
  }
  dom.profileEditTestButton?.toggleAttribute("disabled", !state.currentTest);
  dom.profileViewStatsButton?.toggleAttribute("disabled", !state.currentTest);
}

/**
 * Update avatar display.
 * @param {object} profile
 */
function updateAvatarDisplay(profile) {
  const hasAvatar = Boolean(profile?.avatar_url);

  if (dom.profileAvatarImage) {
    if (hasAvatar) {
      // Add cache buster to force reload
      dom.profileAvatarImage.src = `${profile.avatar_url}?t=${Date.now()}`;
      dom.profileAvatarImage.classList.remove("is-hidden");
    } else {
      dom.profileAvatarImage.src = "";
      dom.profileAvatarImage.classList.add("is-hidden");
    }
  }

  if (dom.profileAvatarPlaceholder) {
    dom.profileAvatarPlaceholder.classList.toggle("is-hidden", hasAvatar);
  }

  if (dom.profileAvatarInitials) {
    const name = profile?.display_name || profile?.username || "";
    dom.profileAvatarInitials.textContent = getInitials(name);
  }

  if (dom.profileAvatarDelete) {
    dom.profileAvatarDelete.classList.toggle("is-hidden", !hasAvatar);
  }
}

/**
 * Get initials from name.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

async function handleEditTest() {
  if (!state.currentTest) {
    showProfileStatus(t("profileSelectTest"), true);
    return;
  }
  const { openEditorModal } = await import("../components/modals.js");
  const { renderEditorQuestionList, resetEditorForm } = await import("../editor.js");
  const { handleDeleteQuestion } = await import("./management.js");

  openEditorModal();
  renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
  resetEditorForm();
}

async function handleViewStats() {
  if (!state.currentTest) {
    showProfileStatus(t("profileSelectTest"), true);
    return;
  }
  const { openStatsScreen } = await import("./statistics.js");
  await openStatsScreen(state.currentTest.id);
}

/**
 * Handle display name update.
 */
async function handleDisplayNameUpdate() {
  const displayName = dom.profileDisplayName?.value?.trim() || null;

  // Don't save if unchanged
  if (currentProfile && displayName === (currentProfile.display_name || null)) {
    return;
  }

  try {
    clearProfileStatus();
    setProfileLoading(true);

    currentProfile = await updateProfile(displayName);
    renderProfileData(currentProfile);

    // Update state for header display
    if (state.currentUser) {
      state.currentUser.display_name = displayName;
    }

    showProfileStatus(t("profileUpdateSuccess"), false);

    // Trigger user display update
    window.dispatchEvent(new CustomEvent("profileUpdated", { detail: currentProfile }));
  } catch (error) {
    showProfileStatus(error.message || t("profileUpdateError"), true);
  } finally {
    setProfileLoading(false);
  }
}

/**
 * Handle avatar upload.
 * @param {Event} event
 */
async function handleAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate file type
  const allowedTypes = ["image/png", "image/jpeg", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    showProfileStatus(t("profileAvatarFormatError"), true);
    event.target.value = "";
    return;
  }

  // Validate file size (2MB)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    showProfileStatus(t("profileAvatarSizeError"), true);
    event.target.value = "";
    return;
  }

  try {
    clearProfileStatus();
    setProfileLoading(true);

    const result = await uploadAvatar(file);

    // Reload profile to get updated avatar URL
    currentProfile = await getProfile();
    renderProfileData(currentProfile);

    showProfileStatus(t("profileAvatarUploadSuccess"), false);

    // Trigger user display update
    window.dispatchEvent(new CustomEvent("profileUpdated", { detail: currentProfile }));
  } catch (error) {
    showProfileStatus(error.message || t("profileAvatarUploadError"), true);
  } finally {
    setProfileLoading(false);
    event.target.value = "";
  }
}

/**
 * Handle avatar delete.
 */
async function handleAvatarDelete() {
  if (!currentProfile?.avatar_url) return;

  try {
    clearProfileStatus();
    setProfileLoading(true);

    await deleteAvatar();

    // Update local profile
    if (currentProfile) {
      currentProfile.avatar_url = null;
      currentProfile.avatar_size = null;
    }
    renderProfileData(currentProfile);

    showProfileStatus(t("profileAvatarDeleteSuccess"), false);

    // Trigger user display update
    window.dispatchEvent(new CustomEvent("profileUpdated", { detail: currentProfile }));
  } catch (error) {
    showProfileStatus(error.message || t("profileAvatarDeleteError"), true);
  } finally {
    setProfileLoading(false);
  }
}

/**
 * Show profile status message.
 * @param {string} message
 * @param {boolean} isError
 */
function showProfileStatus(message, isError = false) {
  if (dom.profileStatus) {
    dom.profileStatus.textContent = message;
    dom.profileStatus.classList.toggle("is-error", isError);
    dom.profileStatus.classList.toggle("is-success", !isError);
    dom.profileStatus.classList.remove("is-hidden");

    // Auto-hide success messages
    if (!isError) {
      setTimeout(() => {
        clearProfileStatus();
      }, 3000);
    }
  }
}

/**
 * Clear profile status message.
 */
function clearProfileStatus() {
  if (dom.profileStatus) {
    dom.profileStatus.textContent = "";
    dom.profileStatus.classList.add("is-hidden");
    dom.profileStatus.classList.remove("is-error", "is-success");
  }
}

/**
 * Set profile loading state.
 * @param {boolean} loading
 */
function setProfileLoading(loading) {
  if (dom.profileDisplayNameSave) {
    dom.profileDisplayNameSave.disabled = loading;
  }
  if (dom.profileAvatarDelete) {
    dom.profileAvatarDelete.disabled = loading;
  }
}

/**
 * Get current profile data.
 * @returns {object|null}
 */
export function getCurrentProfile() {
  return currentProfile;
}
