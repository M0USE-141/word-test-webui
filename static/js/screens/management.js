/**
 * Management Screen - Test collection management
 */

import {
  deleteQuestion as deleteQuestionApi,
  deleteTest as deleteTestApi,
  fetchTest,
  fetchTests,
  renameTest as renameTestApi,
} from "../api.js";
import {
  findEditorQuestion,
  isLegacyDocFile,
  isSupportedImageFile,
  isXmlFile,
  renderEditorObjects,
  renderEditorQuestionList,
  resetEditorForm,
  setEditorObjectSection,
  setEditorObjectStatus,
  syncEditorObjectFields,
  syncEditorPanelLocation,
} from "../editor.js";
import {
  renderManagementScreen,
  renderQuestionNav,
  renderResultSummary,
  renderTestCards,
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
  await deleteQuestionApi(state.currentTest.id, questionId);
  await refreshCurrentTest(state.currentTest.id);
  renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
  resetEditorForm();
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
    dom.editorObjectImageDropzone?.classList.toggle(
      "is-empty",
      !dom.editorObjectImageFile.files?.length
    );
  });

  dom.editorObjectFormulaFile?.addEventListener("change", () => {
    dom.editorObjectFormulaDropzone?.classList.toggle(
      "is-empty",
      !dom.editorObjectFormulaFile.files?.length
    );
  });

  dom.uploadFileInput?.addEventListener("change", () => {
    dom.uploadDropzone?.classList.toggle(
      "is-empty",
      !dom.uploadFileInput.files?.length
    );
  });

  dom.uploadClearButton?.addEventListener("click", () => {
    dom.uploadDropzone?.classList.add("is-empty");
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
}
