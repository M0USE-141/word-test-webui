/**
 * Modal management
 */

import { dom } from "../state.js";
import { updateEditorTestActions } from "../rendering.js";
import { renderEditorObjects } from "../editor.js";

/**
 * Open editor modal
 */
export function openEditorModal() {
  if (!dom.editorModal) {
    return;
  }
  updateEditorTestActions();
  dom.editorModal.classList.add("is-open");
  dom.editorModal.setAttribute("aria-hidden", "false");
  renderEditorObjects();
}

/**
 * Close editor modal
 */
export function closeEditorModal() {
  if (!dom.editorModal) {
    return;
  }
  dom.editorModal.classList.remove("is-open");
  dom.editorModal.setAttribute("aria-hidden", "true");
}

/**
 * Open import modal
 */
export function openImportModal() {
  if (!dom.importModal) {
    return;
  }
  dom.importModal.classList.add("is-open");
  dom.importModal.setAttribute("aria-hidden", "false");
}

/**
 * Close import modal
 */
export function closeImportModal() {
  if (!dom.importModal) {
    return;
  }
  dom.importModal.classList.remove("is-open");
  dom.importModal.setAttribute("aria-hidden", "true");
}

/**
 * Set create test status message
 */
export function setCreateTestStatus(message = "", isError = false) {
  if (!dom.createTestStatus) {
    return;
  }
  dom.createTestStatus.textContent = message;
  dom.createTestStatus.classList.toggle("is-error", isError);
}

/**
 * Open create test modal
 */
export function openCreateTestModal() {
  if (!dom.createTestModal) {
    return;
  }
  setCreateTestStatus("");
  if (dom.createTestTitleInput) {
    dom.createTestTitleInput.value = "";
    dom.createTestTitleInput.focus();
  }
  dom.createTestModal.classList.add("is-open");
  dom.createTestModal.setAttribute("aria-hidden", "false");
}

/**
 * Close create test modal
 */
export function closeCreateTestModal() {
  if (!dom.createTestModal) {
    return;
  }
  dom.createTestModal.classList.remove("is-open");
  dom.createTestModal.setAttribute("aria-hidden", "true");
}
