/**
 * Access Settings Modal component.
 */

import { dom, state } from "../state.js";
import { t } from "../i18n.js";
import {
  getTestAccess,
  updateTestAccess,
  getTestShares,
  addTestShare,
  removeTestShare,
} from "../api.js";

let currentTestId = null;

/**
 * Open access settings modal for a test.
 * @param {string} testId
 * @param {string} testTitle
 */
export async function openAccessSettingsModal(testId, testTitle) {
  if (!dom.accessSettingsModal) return;

  currentTestId = testId;

  // Set test name
  if (dom.accessSettingsTestName) {
    dom.accessSettingsTestName.textContent = testTitle;
  }

  // Reset status
  setAccessLevelStatus("");
  setShareStatus("");

  // Show modal
  dom.accessSettingsModal.classList.add("is-open");
  dom.accessSettingsModal.setAttribute("aria-hidden", "false");

  // Load access info
  await refreshAccessInfo();
}

/**
 * Close access settings modal.
 */
export function closeAccessSettingsModal() {
  if (!dom.accessSettingsModal) return;

  dom.accessSettingsModal.classList.remove("is-open");
  dom.accessSettingsModal.setAttribute("aria-hidden", "true");
  currentTestId = null;
}

/**
 * Refresh access info from API.
 */
async function refreshAccessInfo() {
  if (!currentTestId) return;

  try {
    const accessInfo = await getTestAccess(currentTestId);

    // Set access level
    if (dom.accessLevelSelect) {
      dom.accessLevelSelect.value = accessInfo.access_level || "private";
    }

    // Show/hide shares section based on access level
    updateSharesSectionVisibility();

    // Load shares
    await refreshShares();
  } catch (error) {
    setAccessLevelStatus(error.message, true);
  }
}

/**
 * Refresh shares list from API.
 */
async function refreshShares() {
  if (!currentTestId || !dom.sharesList) return;

  try {
    const shares = await getTestShares(currentTestId);
    renderSharesList(shares);
  } catch (error) {
    setShareStatus(error.message, true);
  }
}

/**
 * Render shares list.
 * @param {Array} shares
 */
function renderSharesList(shares) {
  if (!dom.sharesList) return;

  dom.sharesList.innerHTML = "";

  if (!shares || shares.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "muted";
    emptyItem.textContent = t("noShares");
    dom.sharesList.appendChild(emptyItem);
    return;
  }

  shares.forEach((share) => {
    const item = document.createElement("li");
    item.className = "share-item";

    const info = document.createElement("div");
    info.className = "share-item__info";

    const username = document.createElement("strong");
    username.textContent = share.username;

    const email = document.createElement("span");
    email.className = "muted";
    email.textContent = share.email;

    info.append(username, email);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost danger-text";
    removeBtn.textContent = t("removeShareButton");
    removeBtn.addEventListener("click", () => handleRemoveShare(share.user_id));

    item.append(info, removeBtn);
    dom.sharesList.appendChild(item);
  });
}

/**
 * Handle access level change.
 */
async function handleAccessLevelChange() {
  if (!currentTestId || !dom.accessLevelSelect) return;

  const newLevel = dom.accessLevelSelect.value;
  setAccessLevelStatus(t("savingAccessLevel"));

  try {
    await updateTestAccess(currentTestId, newLevel);
    setAccessLevelStatus(t("accessLevelSaved"), false, true);
    updateSharesSectionVisibility();
  } catch (error) {
    setAccessLevelStatus(error.message, true);
  }
}

/**
 * Handle add share.
 */
async function handleAddShare() {
  if (!currentTestId || !dom.shareUsernameInput) return;

  const username = dom.shareUsernameInput.value.trim();
  if (!username) {
    setShareStatus(t("shareUsernameMissing"), true);
    return;
  }

  setShareStatus(t("addingShare"));

  try {
    await addTestShare(currentTestId, username);
    dom.shareUsernameInput.value = "";
    setShareStatus(t("shareAdded"), false, true);
    await refreshShares();
  } catch (error) {
    setShareStatus(error.message, true);
  }
}

/**
 * Handle remove share.
 * @param {number} userId
 */
async function handleRemoveShare(userId) {
  if (!currentTestId) return;

  setShareStatus(t("removingShare"));

  try {
    await removeTestShare(currentTestId, userId);
    setShareStatus(t("shareRemoved"), false, true);
    await refreshShares();
  } catch (error) {
    setShareStatus(error.message, true);
  }
}

/**
 * Update shares section visibility based on access level.
 */
function updateSharesSectionVisibility() {
  if (!dom.sharesSection || !dom.accessLevelSelect) return;

  const accessLevel = dom.accessLevelSelect.value;
  // Show shares section for "shared" access level
  dom.sharesSection.classList.toggle("is-hidden", accessLevel !== "shared");
}

/**
 * Set access level status message.
 * @param {string} message
 * @param {boolean} isError
 * @param {boolean} isSuccess
 */
function setAccessLevelStatus(message, isError = false, isSuccess = false) {
  if (!dom.accessLevelStatus) return;

  dom.accessLevelStatus.textContent = message;
  dom.accessLevelStatus.classList.toggle("is-error", isError);
  dom.accessLevelStatus.classList.toggle("is-success", isSuccess);
}

/**
 * Set share status message.
 * @param {string} message
 * @param {boolean} isError
 * @param {boolean} isSuccess
 */
function setShareStatus(message, isError = false, isSuccess = false) {
  if (!dom.shareStatus) return;

  dom.shareStatus.textContent = message;
  dom.shareStatus.classList.toggle("is-error", isError);
  dom.shareStatus.classList.toggle("is-success", isSuccess);
}

/**
 * Initialize access modal event listeners.
 */
export function initializeAccessModalEvents() {
  // Close modal
  dom.closeAccessSettingsButton?.addEventListener("click", closeAccessSettingsModal);

  // Close on backdrop click
  dom.accessSettingsModal?.addEventListener("click", (event) => {
    if (event.target === dom.accessSettingsModal) {
      closeAccessSettingsModal();
    }
  });

  // Access level change
  dom.accessLevelSelect?.addEventListener("change", handleAccessLevelChange);

  // Add share
  dom.addShareButton?.addEventListener("click", handleAddShare);

  // Add share on Enter key
  dom.shareUsernameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddShare();
    }
  });
}
