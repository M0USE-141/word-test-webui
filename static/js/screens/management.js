/**
 * Management Screen - Test collection management
 */

import {
  addQuestion,
  createChangeRequest,
  createEmptyTest,
  deleteQuestion as deleteQuestionApi,
  deleteTest as deleteTestApi,
  fetchTest,
  fetchTests,
  renameTest as renameTestApi,
  updateQuestion,
} from "../api.js";
import {
  addOptionRow,
  buildInlineRegistry,
  clearEditorValidation,
  collectEditorOptionPayloads,
  findEditorQuestion,
  formatMissingMarkers,
  handleAddObject,
  isLegacyDocFile,
  isSupportedImageFile,
  isXmlFile,
  parseTextToBlocks,
  renderEditorObjects,
  renderEditorQuestionList,
  resetEditorForm,
  setEditorObjectSection,
  setEditorObjectStatus,
  setEditorState,
  setFieldError,
  syncEditorFormFromQuestion,
  syncEditorObjectFields,
  syncEditorPanelLocation,
} from "../editor.js";
import {
  renderManagementScreen,
  renderQuestionNav,
  renderResultSummary,
  renderTestCards,
  renderUploadLogs,
  setActiveScreen,
  updateEditorTestActions,
  updateProgressHint,
} from "../rendering.js";
import { t, formatNumber } from "../i18n.js";
import { clearTestsCache, dom, editorMobileQuery, loadLastResult, state } from "../state.js";
import {
  closeCreateTestModal,
  closeEditorModal,
  closeImportModal,
  openCreateTestModal,
  openEditorModal,
  openImportModal,
  setCreateTestStatus,
} from "../components/modals.js";
import {
  initializeAccessModalEvents,
  openAccessSettingsModal,
} from "../components/access-modal.js";
import {
  initializeChangeRequestsModalEvents,
  openChangeRequestsModal,
} from "../components/change-requests-modal.js";
import { setupDropzone } from "../utils/file-upload.js";

/**
 * Render test cards with event handlers
 */
export function renderTestCardsWithHandlers(tests, selectedId) {
  renderTestCards(tests, selectedId, {
    onCreateTest: () => {
      openCreateTestModal();
    },
    onImportTest: () => {
      openImportModal();
    },
    onSelectTest: async (testId) => {
      await selectTest(testId);
    },
    onStartTesting: async (testId) => {
      await selectTest(testId);
      setActiveScreen("testing");
    },
    onEditTest: async (testId) => {
      await selectTest(testId);
      openEditorModal();
      renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
      resetEditorForm();
    },
    onViewStats: async (testId) => {
      const { openStatsScreen } = await import("./statistics.js");
      await openStatsScreen(testId);
    },
  });
}

/**
 * Refresh current test data
 */
export async function refreshCurrentTest(testId = state.currentTest?.id) {
  if (!testId) {
    return;
  }

  const { updateTestingPanelsStatus, setActiveTestingPanel } = await import("./testing.js");

  state.currentTest = await fetchTest(testId);
  state.testsCache = await fetchTests();
  renderTestCardsWithHandlers(state.testsCache, state.currentTest.id);
  state.session = null;
  updateProgressHint();
  updateTestingPanelsStatus();
  setActiveTestingPanel("settings");
  dom.questionContainer.textContent = t("startTestingHint");
  dom.optionsContainer.textContent = "";
  dom.questionProgress.textContent = t("questionProgress", {
    current: formatNumber(0),
    total: formatNumber(0),
  });
  renderQuestionNav();
}

/**
 * Select a test (or null to deselect)
 */
export async function selectTest(testId) {
  const { updateTestingPanelsStatus, setActiveTestingPanel } = await import("./testing.js");

  if (!testId) {
    state.currentTest = null;
    state.session = null;
    updateProgressHint();
    updateTestingPanelsStatus();
    setActiveTestingPanel("settings");
    dom.questionContainer.textContent = t("noTestsLoaded");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    renderQuestionNav();
    renderResultSummary(null);
    renderTestCardsWithHandlers(state.testsCache, null);
    updateEditorTestActions();
    return;
  }

  const isSameTest = state.currentTest?.id === testId;
  state.currentTest = await fetchTest(testId);
  updateProgressHint();

  if (!isSameTest) {
    state.session = null;
    updateTestingPanelsStatus();
    setActiveTestingPanel("settings");
    dom.questionContainer.textContent = t("startTestingHint");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    renderQuestionNav();
    renderResultSummary(loadLastResult(testId));
  }

  renderTestCardsWithHandlers(state.testsCache, testId);
  updateEditorTestActions();
}

/**
 * Handle question deletion from editor
 */
export async function handleDeleteQuestion(questionId) {
  if (!state.currentTest) {
    return;
  }

  const isOwner = state.currentTest.is_owner;

  if (isOwner) {
    // Owner can directly delete
    await deleteQuestionApi(state.currentTest.id, questionId);
    await refreshCurrentTest(state.currentTest.id);
    renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
    resetEditorForm();
  } else {
    // Non-owner creates a change request
    try {
      await createChangeRequest(
        state.currentTest.id,
        "delete_question",
        {},
        questionId
      );
      alert(t("changeProposed"));
    } catch (error) {
      alert(error.message);
    }
  }
}

/**
 * Initialize management screen event listeners
 */
export function initializeManagementScreenEvents() {
  import("../utils/file-upload.js").then(({ updateUploadFileState }) => {
    updateUploadFileState(dom.uploadFileInput?.files?.[0], dom.uploadStatus, dom.uploadFilename);
  });

  dom.uploadDropzone?.classList.add("is-empty");
  dom.editorObjectImageDropzone?.classList.add("is-empty");
  dom.editorObjectFormulaDropzone?.classList.add("is-empty");

  dom.editorObjectImageFile?.addEventListener("change", () => {
    const file = dom.editorObjectImageFile.files?.[0];
    dom.editorObjectImageDropzone?.classList.toggle("is-empty", !file);
    // Show file name in dropzone
    const titleEl = dom.editorObjectImageDropzone?.querySelector(".editor-object-dropzone__title span");
    if (titleEl) {
      titleEl.textContent = file ? file.name : t("editorObjectImageDropTitle");
    }
  });

  dom.editorObjectFormulaFile?.addEventListener("change", () => {
    const file = dom.editorObjectFormulaFile.files?.[0];
    dom.editorObjectFormulaDropzone?.classList.toggle("is-empty", !file);
    // Show file name in dropzone
    const titleEl = dom.editorObjectFormulaDropzone?.querySelector(".editor-object-dropzone__title span");
    if (titleEl) {
      titleEl.textContent = file ? file.name : t("editorObjectFormulaDropTitle");
    }
  });

  dom.uploadFileInput?.addEventListener("change", () => {
    const file = dom.uploadFileInput.files?.[0] || null;
    dom.uploadDropzone?.classList.toggle("is-empty", !file);
    dom.uploadFileName?.classList.toggle("is-empty", !file);
    if (dom.uploadFileNameValue) {
      dom.uploadFileNameValue.textContent = file ? file.name : t("uploadNoFileSelected");
      dom.uploadFileNameValue.title = file ? file.name : "";
    }
    if (dom.uploadClearButton) {
      dom.uploadClearButton.disabled = !file;
    }
  });

  dom.uploadClearButton?.addEventListener("click", () => {
    if (dom.uploadFileInput) {
      dom.uploadFileInput.value = "";
    }
    dom.uploadDropzone?.classList.add("is-empty");
    dom.uploadFileName?.classList.add("is-empty");
    if (dom.uploadFileNameValue) {
      dom.uploadFileNameValue.textContent = t("uploadNoFileSelected");
      dom.uploadFileNameValue.title = "";
    }
    if (dom.uploadClearButton) {
      dom.uploadClearButton.disabled = true;
    }
  });

  dom.editorObjectFormulaText?.addEventListener("input", () => {
    setEditorObjectStatus("");
  });

  dom.editorObjectId?.addEventListener("input", () => {
    setEditorObjectStatus("");
  });

  editorMobileQuery.addEventListener("change", syncEditorPanelLocation);
  syncEditorObjectFields();
  setEditorObjectSection(null);

  setupDropzone(dom.uploadDropzone, dom.uploadFileInput);
  setupDropzone(dom.editorObjectImageDropzone, dom.editorObjectImageFile, {
    validate: isSupportedImageFile,
    onInvalid: () => {
      setEditorObjectStatus(t("objectImageInvalid"), true);
    },
  });
  setupDropzone(dom.editorObjectFormulaDropzone, dom.editorObjectFormulaFile, {
    validate: isXmlFile,
    onInvalid: () => {
      setEditorObjectStatus(t("objectXmlInvalid"), true);
    },
  });

  dom.editorModal?.addEventListener("click", (event) => {
    if (event.target === dom.editorModal) {
      closeEditorModal();
    }
  });

  dom.editorAddOption?.addEventListener("click", () => {
    addOptionRow("", false);
  });

  dom.editorObjectsToggle?.addEventListener("click", () => {
    const isVisible = !dom.editorObjectListSection?.classList.contains(
      "is-hidden"
    );
    setEditorObjectSection(isVisible ? null : "list");
  });

  dom.editorObjectUploadToggle?.addEventListener("click", () => {
    const isVisible = !dom.editorObjectUploadSection?.classList.contains(
      "is-hidden"
    );
    setEditorObjectSection(isVisible ? null : "upload");
  });

  dom.editorResetButton?.addEventListener("click", () => {
    resetEditorForm();
  });

  dom.editorObjectType?.addEventListener("change", () => {
    syncEditorObjectFields();
  });

  dom.editorAddObjectButton?.addEventListener("click", () => {
    handleAddObject();
  });

  dom.editorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentTest) {
      return;
    }
    clearEditorValidation();
    const questionRaw = dom.editorQuestionText.value ?? "";
    if (!questionRaw.trim()) {
      alert(t("alertFillQuestion"));
      return;
    }
    const inlineRegistry = buildInlineRegistry(
      findEditorQuestion() ?? { objects: state.editorState.objects }
    );
    const questionParse = parseTextToBlocks(questionRaw, inlineRegistry);
    const questionField = dom.editorQuestionText?.closest(".editor-field");
    if (questionParse.missing.length && questionField) {
      setFieldError(
        questionField,
        t("missingObjects", {
          objects: formatMissingMarkers(questionParse.missing),
        })
      );
    }

    const optionPayloads = collectEditorOptionPayloads(inlineRegistry);
    if (!optionPayloads.payloads.length) {
      alert(t("alertFillQuestion"));
      return;
    }
    optionPayloads.missingByOption.forEach(({ element, missing }) => {
      setFieldError(
        element,
        t("missingObjects", { objects: formatMissingMarkers(missing) })
      );
    });

    if (questionParse.missing.length || optionPayloads.missingByOption.length) {
      alert(t("alertCheckObjects"));
      return;
    }

    try {
      const payload = {
        question: { blocks: questionParse.blocks },
        options: optionPayloads.payloads,
        objects: state.editorState.objects,
      };
      if (optionPayloads.correctBlocks) {
        payload.correct = { blocks: optionPayloads.correctBlocks };
      }

      const isOwner = state.currentTest.is_owner;

      if (state.editorState.mode === "edit" && state.editorState.questionId) {
        const editedId = state.editorState.questionId;

        if (isOwner) {
          // Owner can directly edit
          await updateQuestion(state.currentTest.id, editedId, payload);
          await refreshCurrentTest(state.currentTest.id);
          renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
          const updatedQuestion = state.currentTest?.questions?.find(
            (question) => question.id === editedId
          );
          if (updatedQuestion) {
            setEditorState("edit", editedId);
            syncEditorFormFromQuestion(updatedQuestion);
            renderEditorObjects(updatedQuestion);
          } else {
            resetEditorForm();
          }
        } else {
          // Non-owner creates a change request
          await createChangeRequest(
            state.currentTest.id,
            "edit_question",
            payload,
            editedId
          );
          alert(t("changeProposed"));
          resetEditorForm();
        }
      } else {
        if (isOwner) {
          // Owner can directly add
          await addQuestion(state.currentTest.id, payload);
          await refreshCurrentTest(state.currentTest.id);
          renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
          resetEditorForm();
        } else {
          // Non-owner creates a change request
          await createChangeRequest(
            state.currentTest.id,
            "add_question",
            payload
          );
          alert(t("changeProposed"));
          resetEditorForm();
        }
      }
    } catch (error) {
      alert(error.message);
    }
  });

  dom.closeEditorButton?.addEventListener("click", () => {
    closeEditorModal();
  });

  dom.closeImportButton?.addEventListener("click", () => {
    closeImportModal();
  });

  dom.closeCreateTestButton?.addEventListener("click", () => {
    closeCreateTestModal();
  });

  dom.cancelCreateTestButton?.addEventListener("click", () => {
    closeCreateTestModal();
  });

  dom.importModal?.addEventListener("click", (event) => {
    if (event.target === dom.importModal) {
      closeImportModal();
    }
  });

  dom.createTestModal?.addEventListener("click", (event) => {
    if (event.target === dom.createTestModal) {
      closeCreateTestModal();
    }
  });

  // Initialize access modal events
  initializeAccessModalEvents();

  // Initialize change requests modal events
  initializeChangeRequestsModalEvents();

  dom.editorAccessSettingsButton?.addEventListener("click", () => {
    if (!state.currentTest) {
      return;
    }
    openAccessSettingsModal(state.currentTest.id, state.currentTest.title);
  });

  dom.editorChangeRequestsButton?.addEventListener("click", () => {
    if (!state.currentTest) {
      return;
    }
    openChangeRequestsModal(state.currentTest.id, state.currentTest.title);
  });

  dom.editorRenameTestButton?.addEventListener("click", async () => {
    if (!state.currentTest) {
      return;
    }
    const newTitle = window.prompt(
      t("promptRenameTest"),
      state.currentTest.title
    );
    if (!newTitle || newTitle.trim() === state.currentTest.title) {
      return;
    }
    try {
      await renameTestApi(state.currentTest.id, newTitle.trim());
      state.currentTest = await fetchTest(state.currentTest.id);
      clearTestsCache();
      state.testsCache = await fetchTests({ force: true });
      renderTestCardsWithHandlers(state.testsCache, state.currentTest.id);
      updateProgressHint();
      updateEditorTestActions();
    } catch (error) {
      window.alert(error.message);
    }
  });

  dom.editorDeleteTestButton?.addEventListener("click", async () => {
    if (!state.currentTest) {
      return;
    }
    const confirmed = window.confirm(t("confirmDeleteTest"));
    if (!confirmed) {
      return;
    }
    try {
      await deleteTestApi(state.currentTest.id);
      clearTestsCache();
      state.testsCache = await fetchTests({ force: true });
      if (state.testsCache.length) {
        await selectTest(state.testsCache[0].id);
      } else {
        await selectTest(null);
      }
      closeEditorModal();
    } catch (error) {
      window.alert(error.message);
    }
  });

  // Upload form (import test)
  dom.uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dom.uploadFileInput.files?.length) {
      dom.questionContainer.textContent = t("importSelectFileFirst");
      renderUploadLogs(t("importSelectFileFirst"), true);
      return;
    }
    if (isLegacyDocFile(dom.uploadFileInput.files[0].name)) {
      dom.questionContainer.textContent = t("docxOnlyWarning");
      renderUploadLogs(t("docxOnlyWarning"), true);
      return;
    }

    const formData = new FormData();
    formData.append("file", dom.uploadFileInput.files[0]);
    formData.append("symbol", dom.uploadSymbolInput.value.trim());
    formData.append(
      "log_small_tables",
      dom.uploadLogSmallTablesInput.checked ? "true" : "false"
    );

    try {
      const response = await fetch("/api/tests/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload?.detail || t("importFailed");
        throw new Error(detail);
      }
      const uploadResult = payload ?? {};
      clearTestsCache();
      const tests = await fetchTests({ force: true });
      const newTestId = uploadResult?.metadata?.id;
      renderUploadLogs(uploadResult?.logs);

      const nextTestId = newTestId || tests[0]?.id;
      renderTestCardsWithHandlers(tests, nextTestId);
      await selectTest(nextTestId);

      // Reset form
      dom.uploadFileInput.value = "";
      dom.uploadSymbolInput.value = "";
      dom.uploadLogSmallTablesInput.checked = false;
      dom.uploadDropzone?.classList.add("is-empty");
      dom.uploadFileName?.classList.add("is-empty");
      if (dom.uploadFileNameValue) {
        dom.uploadFileNameValue.textContent = t("uploadNoFileSelected");
      }
      if (dom.uploadClearButton) {
        dom.uploadClearButton.disabled = true;
      }
      closeImportModal();
    } catch (error) {
      dom.questionContainer.textContent = error.message;
      renderUploadLogs(error.message, true);
    }
  });

  // Create test form
  dom.createTestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dom.createTestTitleInput) {
      return;
    }
    const title = dom.createTestTitleInput.value.trim();
    if (!title) {
      setCreateTestStatus(t("createTestTitleMissing"), true);
      return;
    }
    const accessLevel = dom.createTestAccessSelect?.value || "private";
    setCreateTestStatus(t("createTestCreating"));
    try {
      const payload = await createEmptyTest(title, accessLevel);
      const newTestId = payload?.metadata?.id || payload?.payload?.id;
      clearTestsCache();
      const tests = await fetchTests({ force: true });
      renderTestCardsWithHandlers(tests, newTestId);
      if (newTestId) {
        await selectTest(newTestId);
      }
      dom.createTestTitleInput.value = "";
      if (dom.createTestAccessSelect) {
        dom.createTestAccessSelect.value = "private";
      }
      setCreateTestStatus("");
      closeCreateTestModal();
    } catch (error) {
      setCreateTestStatus(error.message, true);
    }
  });
}
