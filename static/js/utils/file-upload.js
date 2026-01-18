/**
 * File upload utilities
 */

import { t } from "../i18n.js";

export function updateUploadFileState(file, statusElement, filenameElement) {
  if (!file) {
    if (statusElement) statusElement.textContent = "";
    if (filenameElement) {
      filenameElement.textContent = "";
      filenameElement.title = "";
    }
    return;
  }

  const name = file.name || t("unknownFile");
  const sizeKb = Math.round((file.size || 0) / 1024);
  const sizeLabel = `${sizeKb} KB`;

  if (statusElement) {
    statusElement.textContent = `${name} (${sizeLabel})`;
  }
  if (filenameElement) {
    filenameElement.textContent = name;
    filenameElement.title = name;
  }
}

export function assignFileToInput(input, file) {
  if (!input || !file) return;

  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

export function setupDropzone(dropzone, input, { validate, onInvalid } = {}) {
  if (!dropzone || !input) return;

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (validate && !validate(file)) {
        if (onInvalid) onInvalid(file);
        return;
      }
      assignFileToInput(input, file);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  dropzone.addEventListener("click", () => {
    input.click();
  });
}
