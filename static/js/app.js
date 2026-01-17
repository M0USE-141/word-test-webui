import {
  addQuestion,
  createEmptyTest,
  deleteQuestion as deleteQuestionApi,
  deleteTest as deleteTestApi,
  fetchAnalytics,
  fetchTest,
  fetchTests,
  recordAttempt,
  renameTest as renameTestApi,
  updateQuestion,
} from "./api.js";
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
} from "./editor.js";
import {
  renderManagementScreen,
  renderQuestion,
  renderQuestionNav,
  renderResultSummary,
  renderTestCards,
  renderUploadLogs,
  renderAnalytics,
  recordCurrentQuestionDuration,
  setCurrentQuestion,
  setActiveScreen,
  updateEditorTestActions,
  updateProgressHint,
} from "./rendering.js";
import { defaultLocale, formatNumber, setLocale, t } from "./i18n.js";
import {
  clearLastResult,
  clearTestsCache,
  dom,
  editorMobileQuery,
  getSettings,
  loadLastResult,
  loadProgress,
  saveLastResult,
  state,
} from "./state.js";

const THEME_STORAGE_KEY = "ui-theme";
const DEFAULT_THEME = "light";
const LOCALE_STORAGE_KEY = "ui-locale";

function applyLocale(lang) {
  const nextLocale = setLocale(lang);
  state.uiState.locale = nextLocale;
  document.documentElement.lang = nextLocale;
  document.title = t("pageTitle");
  localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  if (dom.langSelect) {
    dom.langSelect.value = nextLocale;
  }

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (!key) {
      return;
    }
    element.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (!key) {
      return;
    }
    element.setAttribute("placeholder", t(key));
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    if (!key) {
      return;
    }
    element.setAttribute("aria-label", t(key));
  });

  updateProgressHint();
  if (state.session) {
    renderQuestion();
  }
  renderResultSummary(
    state.currentTest?.id ? loadLastResult(state.currentTest.id) : null
  );
  renderTestCardsWithHandlers(state.testsCache, state.currentTest?.id || null);
  updateEditorTestActions();
  renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
  renderEditorObjects();
  updateUploadFileState(dom.uploadFileInput?.files?.[0] || null);

  return nextLocale;
}

function applyThemePreference(theme) {
  const nextTheme = theme === "dark" ? "dark" : DEFAULT_THEME;
  document.documentElement.dataset.theme = nextTheme;
  if (dom.themeToggle) {
    dom.themeToggle.checked = nextTheme === "dark";
  }
  return nextTheme;
}

function setupThemeToggle() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const activeTheme = applyThemePreference(stored || DEFAULT_THEME);
  if (!stored) {
    localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
  }
  if (!dom.themeToggle) {
    return;
  }
  dom.themeToggle.addEventListener("change", (event) => {
    const nextTheme = applyThemePreference(
      event.target.checked ? "dark" : "light"
    );
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  });
}

function updateUploadFileState(file) {
  if (!dom.uploadFileName) {
    return;
  }
  if (file) {
    if (dom.uploadFileNameValue) {
      dom.uploadFileNameValue.textContent = file.name;
    } else {
      dom.uploadFileName.textContent = file.name;
    }
    dom.uploadFileName.classList.remove("is-empty");
    dom.uploadDropzone?.classList.remove("is-empty");
    if (dom.uploadClearButton) {
      dom.uploadClearButton.disabled = false;
    }
    if (isLegacyDocFile(file.name)) {
      renderUploadLogs(t("docxOnlyWarning"), true);
    } else {
      renderUploadLogs(null);
    }
    return;
  }
  const noFileLabel = t("uploadNoFileSelected");
  if (dom.uploadFileNameValue) {
    dom.uploadFileNameValue.textContent = noFileLabel;
  } else {
    dom.uploadFileName.textContent = noFileLabel;
  }
  dom.uploadFileName.classList.add("is-empty");
  dom.uploadDropzone?.classList.add("is-empty");
  if (dom.uploadClearButton) {
    dom.uploadClearButton.disabled = true;
  }
  renderUploadLogs(null);
}

function assignFileToInput(input, file) {
  if (!input || !file) {
    return;
  }
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setupDropzone(dropzone, input, { validate, onInvalid } = {}) {
  if (!dropzone || !input) {
    return;
  }
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

function buildSession(test, settings) {
  const progress = loadProgress(test.id);
  let questions = test.questions.map((question, index) => ({
    question,
    questionId: question.id ?? index + 1,
    originalIndex: index,
  }));

  if (settings.onlyUnanswered) {
    questions = questions.filter((entry) => !progress.has(entry.questionId));
  }
  if (settings.randomQuestions) {
    questions = shuffle(questions);
  }
  if (settings.questionCount > 0) {
    questions = questions.slice(0, settings.questionCount);
  }

  return {
    testId: test.id,
    questions,
    currentIndex: 0,
    answers: new Map(),
    answerStatus: new Map(),
    optionOrders: new Map(),
    questionTimings: new Map(),
    questionStartedAt: Date.now(),
    startedAt: new Date().toISOString(),
    finished: false,
    settings,
  };
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderTestCardsWithHandlers(tests, selectedId) {
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
  });
}

function openEditorModal() {
  if (!dom.editorModal) {
    return;
  }
  updateEditorTestActions();
  dom.editorModal.classList.add("is-open");
  dom.editorModal.setAttribute("aria-hidden", "false");
  renderEditorObjects();
}

function closeEditorModal() {
  if (!dom.editorModal) {
    return;
  }
  dom.editorModal.classList.remove("is-open");
  dom.editorModal.setAttribute("aria-hidden", "true");
}

function openImportModal() {
  if (!dom.importModal) {
    return;
  }
  dom.importModal.classList.add("is-open");
  dom.importModal.setAttribute("aria-hidden", "false");
}

function closeImportModal() {
  if (!dom.importModal) {
    return;
  }
  dom.importModal.classList.remove("is-open");
  dom.importModal.setAttribute("aria-hidden", "true");
}

function setCreateTestStatus(message = "", isError = false) {
  if (!dom.createTestStatus) {
    return;
  }
  dom.createTestStatus.textContent = message;
  dom.createTestStatus.classList.toggle("is-error", isError);
}

function openCreateTestModal() {
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

function closeCreateTestModal() {
  if (!dom.createTestModal) {
    return;
  }
  dom.createTestModal.classList.remove("is-open");
  dom.createTestModal.setAttribute("aria-hidden", "true");
}

async function refreshCurrentTest(testId = state.currentTest?.id) {
  if (!testId) {
    return;
  }
  state.currentTest = await fetchTest(testId);
  state.testsCache = await fetchTests();
  renderTestCardsWithHandlers(state.testsCache, state.currentTest.id);
  state.session = null;
  updateProgressHint();
  dom.questionContainer.textContent = t("startTestingHint");
  dom.optionsContainer.textContent = "";
  dom.questionProgress.textContent = t("questionProgress", {
    current: formatNumber(0),
    total: formatNumber(0),
  });
  renderQuestionNav();
}

async function selectTest(testId) {
  if (!testId) {
    state.currentTest = null;
    state.session = null;
    updateProgressHint();
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

async function handleDeleteQuestion(questionId) {
  if (!state.currentTest) {
    return;
  }
  await deleteQuestionApi(state.currentTest.id, questionId);
  await refreshCurrentTest(state.currentTest.id);
  renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
  resetEditorForm();
}

function finishTest() {
  if (!state.session || state.session.finished) {
    return;
  }
  recordCurrentQuestionDuration();
  state.session.finished = true;

  let correct = 0;
  let answered = 0;
  const questionStatuses = new Map();
  state.session.questions.forEach((entry) => {
    const selected = state.session.answers.get(entry.questionId);
    if (selected === undefined || selected === -1) {
      questionStatuses.set(entry.questionId, "unanswered");
      return;
    }
    answered += 1;
    const options =
      state.session.optionOrders.get(entry.questionId) ??
      entry.question.options;
    if (options[selected]?.isCorrect) {
      questionStatuses.set(entry.questionId, "correct");
      correct += 1;
    } else if (options.some((option) => option.isCorrect)) {
      questionStatuses.set(entry.questionId, "incorrect");
    } else {
      questionStatuses.set(entry.questionId, "answered");
    }
  });
  const total = state.session.questions.length;
  const percent = total ? (correct / total) * 100 : 0;

  saveLastResult(state.session.testId, {
    correct,
    total,
    answered,
    percent,
    completedAt: new Date().toISOString(),
  });
  renderTestCardsWithHandlers(state.testsCache, state.session.testId);
  renderResultSummary({ correct, total, answered, percent });
  renderQuestion();

  const attemptPayload = {
    started_at: state.session.startedAt,
    completed_at: new Date().toISOString(),
    correct,
    total,
    answered,
    percent,
    duration_seconds: Array.from(state.session.questionTimings.values()).reduce(
      (sum, value) => sum + value,
      0
    ) / 1000,
    question_stats: state.session.questions.map((entry) => {
      const selectedIndex =
        state.session.answers.get(entry.questionId) ?? null;
      const options =
        state.session.optionOrders.get(entry.questionId) ??
        entry.question.options;
      const correctIndex = options.findIndex((option) => option.isCorrect);
      const status =
        questionStatuses.get(entry.questionId) ||
        (selectedIndex === null || selectedIndex === -1
          ? "unanswered"
          : "answered");
      const isCorrect =
        selectedIndex === null ||
        selectedIndex === -1 ||
        correctIndex === -1
          ? null
          : selectedIndex === correctIndex;
      return {
        question_id: entry.questionId,
        selected_index: selectedIndex,
        is_correct: isCorrect,
        status,
        duration_seconds:
          (state.session.questionTimings.get(entry.questionId) || 0) / 1000,
      };
    }),
  };
  recordAttempt(state.session.testId, attemptPayload).catch(() => {});
}

function startTest() {
  if (!state.currentTest) {
    dom.questionContainer.textContent = t("noTestSelected");
    return;
  }
  const settings = getSettings();
  state.session = buildSession(state.currentTest, settings);
  renderResultSummary(null);
  if (!state.session.questions.length) {
    dom.questionContainer.textContent = t("noQuestionsForTesting");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    return;
  }
  renderQuestion();
}

function openAnalyticsModal() {
  if (!dom.analyticsModal) {
    return;
  }
  dom.analyticsModal.classList.add("is-open");
  dom.analyticsModal.setAttribute("aria-hidden", "false");
  if (dom.analyticsStatus) {
    dom.analyticsStatus.textContent = t("analyticsLoading");
  }
  fetchAnalytics()
    .then((analytics) => {
      if (dom.analyticsStatus) {
        dom.analyticsStatus.textContent = analytics.attempts_count
          ? ""
          : t("analyticsEmpty");
      }
      renderAnalytics(analytics);
    })
    .catch((error) => {
      if (dom.analyticsStatus) {
        dom.analyticsStatus.textContent = error.message;
      }
      renderAnalytics(null);
    });
}

function closeAnalyticsModal() {
  if (!dom.analyticsModal) {
    return;
  }
  dom.analyticsModal.classList.remove("is-open");
  dom.analyticsModal.setAttribute("aria-hidden", "true");
}

function initializeManagementScreenEvents() {
  updateUploadFileState(dom.uploadFileInput?.files?.[0]);
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
      setEditorObjectStatus(
        t("objectImageInvalid"),
        true
      );
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
      localStorage.removeItem(`test-progress:${state.currentTest.id}`);
      clearLastResult(state.currentTest.id);
      clearTestsCache();
      state.testsCache = await fetchTests({ force: true });
      const nextId = state.testsCache[0]?.id || null;
      renderTestCardsWithHandlers(state.testsCache, nextId);
      await selectTest(nextId);
      closeEditorModal();
    } catch (error) {
      window.alert(error.message);
    }
  });

  dom.editorModal?.addEventListener("click", (event) => {
    if (event.target === dom.editorModal) {
      closeEditorModal();
    }
  });

  dom.openAnalyticsButton?.addEventListener("click", () => {
    openAnalyticsModal();
  });

  dom.closeAnalyticsButton?.addEventListener("click", () => {
    closeAnalyticsModal();
  });

  dom.analyticsModal?.addEventListener("click", (event) => {
    if (event.target === dom.analyticsModal) {
      closeAnalyticsModal();
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
      if (state.editorState.mode === "edit" && state.editorState.questionId) {
        const editedId = state.editorState.questionId;
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
        await addQuestion(state.currentTest.id, payload);
        await refreshCurrentTest(state.currentTest.id);
        renderEditorQuestionList({ onDeleteQuestion: handleDeleteQuestion });
        resetEditorForm();
      }
    } catch (error) {
      alert(error.message);
    }
  });

  dom.uploadFileInput?.addEventListener("change", () => {
    updateUploadFileState(dom.uploadFileInput.files?.[0] || null);
  });
  dom.uploadClearButton?.addEventListener("click", () => {
    if (dom.uploadFileInput) {
      dom.uploadFileInput.value = "";
    }
    updateUploadFileState(null);
  });

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
      const tests = await fetchTests({ force: true });
      const newTestId = uploadResult?.metadata?.id;
      renderUploadLogs(uploadResult?.logs);

      const nextTestId = newTestId || tests[0]?.id;
      renderTestCardsWithHandlers(tests, nextTestId);
      await selectTest(nextTestId);
      dom.uploadFileInput.value = "";
      dom.uploadSymbolInput.value = "";
      dom.uploadLogSmallTablesInput.checked = false;
      updateUploadFileState(null);
      closeImportModal();
    } catch (error) {
      dom.questionContainer.textContent = error.message;
      renderUploadLogs(error.message, true);
    }
  });

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
    setCreateTestStatus(t("createTestCreating"));
    try {
      const payload = await createEmptyTest(title);
      const newTestId = payload?.metadata?.id || payload?.payload?.id;
      const tests = await fetchTests({ force: true });
      renderTestCardsWithHandlers(tests, newTestId);
      if (newTestId) {
        await selectTest(newTestId);
      }
      closeCreateTestModal();
    } catch (error) {
      setCreateTestStatus(error.message, true);
    }
  });
}

function initializeTestingScreenEvents() {
  dom.prevQuestionButton?.addEventListener("click", () => {
    if (!state.session) {
      return;
    }
    setCurrentQuestion(Math.max(0, state.session.currentIndex - 1));
  });

  dom.nextQuestionButton?.addEventListener("click", () => {
    if (!state.session) {
      return;
    }
    setCurrentQuestion(Math.min(
      state.session.questions.length - 1,
      state.session.currentIndex + 1
    ));
  });

  dom.finishTestButton?.addEventListener("click", () => {
    finishTest();
  });

  dom.startTestButton?.addEventListener("click", () => {
    startTest();
  });

  dom.exitTestButton?.addEventListener("click", () => {
    setActiveScreen("management");
    dom.optionsContainer.classList.add("is-hidden");
  });
}

async function initialize() {
  const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) || defaultLocale;
  applyLocale(storedLocale);
  setupThemeToggle();
  initializeManagementScreenEvents();
  initializeTestingScreenEvents();
  renderManagementScreen();

  dom.langSelect?.addEventListener("change", (event) => {
    applyLocale(event.target.value);
  });

  try {
    const tests = await fetchTests();
    if (!tests.length) {
      renderTestCardsWithHandlers(tests);
      await selectTest(null);
      return;
    }

    renderTestCardsWithHandlers(tests, tests[0].id);
    await selectTest(tests[0].id);
  } catch (error) {
    dom.questionContainer.textContent = error.message;
  }
}

initialize();
