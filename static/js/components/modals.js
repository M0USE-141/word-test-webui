/**
 * Modal management
 */

export function openModal(modal) {
  if (!modal) return;
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

export function closeModal(modal) {
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "";
}

export function openEditorModal(dom) {
  openModal(dom.editorModal);
}

export function closeEditorModal(dom) {
  closeModal(dom.editorModal);
}

export function openImportModal(dom) {
  openModal(dom.importModal);
}

export function closeImportModal(dom) {
  closeModal(dom.importModal);
}

export function openCreateTestModal(dom) {
  openModal(dom.createTestModal);
  if (dom.createTestTitleInput) {
    dom.createTestTitleInput.value = "";
    dom.createTestTitleInput.focus();
  }
}

export function closeCreateTestModal(dom) {
  closeModal(dom.createTestModal);
}

export function setCreateTestStatus(dom, message = "", isError = false) {
  if (!dom.createTestStatus) return;
  dom.createTestStatus.textContent = message;
  dom.createTestStatus.className = isError ? "error" : "success";
}
