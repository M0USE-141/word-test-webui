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
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setupDropzone(dropzone, input, { validate, onInvalid } = {}) {
  if (!dropzone || !input) return;

  const highlight = () => dropzone.classList.add("is-dragover");
  const unhighlight = () => dropzone.classList.remove("is-dragover");
  const prevent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      prevent(event);
      highlight();
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      prevent(event);
      unhighlight();
    });
  });

  dropzone.addEventListener("drop", (event) => {
    prevent(event);
    unhighlight();
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    if (validate && !validate(file)) {
      if (onInvalid) {
        onInvalid(file);
      }
      return;
    }
    assignFileToInput(input, file);
  });
}
