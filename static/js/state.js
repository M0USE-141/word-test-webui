export const dom = {
  themeToggle: document.getElementById("theme-toggle"),
  langSelect: document.getElementById("lang-select"),
  // Auth elements
  screenAuth: document.getElementById("screen-auth"),
  authLoginTab: document.getElementById("auth-login-tab"),
  authRegisterTab: document.getElementById("auth-register-tab"),
  authStatus: document.getElementById("auth-status"),
  authLoginForm: document.getElementById("auth-login-form"),
  authRegisterForm: document.getElementById("auth-register-form"),
  authLoginUsername: document.getElementById("auth-login-username"),
  authLoginPassword: document.getElementById("auth-login-password"),
  authLoginButton: document.getElementById("auth-login-button"),
  authRegisterUsername: document.getElementById("auth-register-username"),
  authRegisterEmail: document.getElementById("auth-register-email"),
  authRegisterPassword: document.getElementById("auth-register-password"),
  authRegisterConfirmPassword: document.getElementById("auth-register-confirm-password"),
  authRegisterButton: document.getElementById("auth-register-button"),
  userChip: document.getElementById("user-menu-toggle"),
  userDisplay: document.getElementById("user-display"),
  userAvatarImage: document.getElementById("user-avatar-image"),
  userAvatarInitials: document.getElementById("user-avatar-initials"),
  userMenuToggle: document.getElementById("user-menu-toggle"),
  userMenu: document.getElementById("user-menu"),
  userMenuItems: document.querySelectorAll("#user-menu .user-menu__item"),
  testCardsContainer: document.getElementById("test-cards"),
  testTabs: document.getElementById("test-tabs"),
  questionList: document.getElementById("question-nav"),
  questionContainer: document.getElementById("question-container"),
  optionsContainer: document.getElementById("options-container"),
  uploadForm: document.getElementById("upload-form"),
  uploadFileInput: document.getElementById("upload-file"),
  uploadDropzone: document.getElementById("upload-dropzone"),
  uploadFileName: document.getElementById("upload-file-name"),
  uploadFileNameValue: document.querySelector(".upload-file-name__value"),
  uploadClearButton: document.getElementById("upload-clear-file"),
  uploadSymbolInput: document.getElementById("upload-symbol"),
  uploadLogSmallTablesInput: document.getElementById(
    "upload-log-small-tables"
  ),
  uploadLogs: document.getElementById("upload-logs"),
  questionProgress: document.getElementById("question-progress"),
  questionStatus: document.getElementById("question-status"),
  prevQuestionButton: document.getElementById("prev-question"),
  nextQuestionButton: document.getElementById("next-question"),
  finishTestButton: document.getElementById("finish-test"),
  answerFeedback: document.getElementById("answer-feedback"),
  startTestButton: document.getElementById("start-test"),
  exitTestButton: document.getElementById("exit-test"),
  settingsPanel: document.getElementById("panel-settings"),
  resultsPanel: document.getElementById("panel-results"),
  questionsPanel: document.getElementById("panel-questions"),
  settingsPanelToggle: document.getElementById("panel-settings-toggle"),
  resultsPanelToggle: document.getElementById("panel-results-toggle"),
  questionsPanelToggle: document.getElementById("panel-questions-toggle"),
  settingsTestTitle: document.getElementById("settings-test-title"),
  resultSummary: document.getElementById("result-summary"),
  resultDetails: document.getElementById("result-details"),
  progressHint: document.getElementById("progress-hint"),
  editorModal: document.getElementById("editor-modal"),
  closeEditorButton: document.getElementById("close-editor"),
  editorAccessSettingsButton: document.getElementById("editor-access-settings"),
  editorTestStatsButton: document.getElementById("editor-test-stats"),
  editorRenameTestButton: document.getElementById("editor-rename-test"),
  editorDeleteTestButton: document.getElementById("editor-delete-test"),
  importModal: document.getElementById("import-modal"),
  closeImportButton: document.getElementById("close-import"),
  createTestModal: document.getElementById("create-test-modal"),
  closeCreateTestButton: document.getElementById("close-create-test"),
  cancelCreateTestButton: document.getElementById("cancel-create-test"),
  createTestForm: document.getElementById("create-test-form"),
  createTestTitleInput: document.getElementById("create-test-title"),
  createTestAccessSelect: document.getElementById("create-test-access"),
  createTestStatus: document.getElementById("create-test-status"),
  editorQuestionList: document.getElementById("editor-question-list"),
  editorForm: document.getElementById("editor-form"),
  editorFormTitle: document.getElementById("editor-form-title"),
  editorQuestionText: document.getElementById("editor-question-text"),
  editorOptionsList: document.getElementById("editor-options-list"),
  editorObjectsList: document.getElementById("editor-objects"),
  editorAddOption: document.getElementById("add-option"),
  editorResetButton: document.getElementById("reset-editor"),
  editorStatus: document.getElementById("editor-status"),
  editorPanel: document.getElementById("editor-panel"),
  editorPanelHome: document.querySelector(".editor-column--form"),
  editorObjectType: document.getElementById("editor-object-type"),
  editorObjectId: document.getElementById("editor-object-id"),
  editorObjectImageFields: document.getElementById(
    "editor-object-image-fields"
  ),
  editorObjectImageFile: document.getElementById(
    "editor-object-image-file"
  ),
  editorObjectFormulaFields: document.getElementById(
    "editor-object-formula-fields"
  ),
  editorObjectFormulaText: document.getElementById(
    "editor-object-formula-text"
  ),
  editorObjectFormulaFile: document.getElementById(
    "editor-object-formula-file"
  ),
  editorObjectImageDropzone: document.querySelector(
    'label[for="editor-object-image-file"]'
  ),
  editorObjectFormulaDropzone: document.querySelector(
    'label[for="editor-object-formula-file"]'
  ),
  editorAddObjectButton: document.getElementById("editor-add-object"),
  editorObjectStatus: document.getElementById("editor-object-status"),
  editorObjectsToggle: document.getElementById("toggle-editor-objects"),
  editorObjectUploadToggle: document.getElementById(
    "toggle-editor-object-upload"
  ),
  editorObjectUploadSection: document.getElementById(
    "editor-object-upload-section"
  ),
  editorObjectListSection: document.getElementById(
    "editor-object-list-section"
  ),
  screenManagement: document.getElementById("screen-management"),
  screenTesting: document.getElementById("screen-testing"),
  screenStats: document.getElementById("screen-stats"),
  screenProfile: document.getElementById("screen-profile"),
  // Profile elements
  profileBackButton: document.getElementById("profile-back"),
  profileAvatarImage: document.getElementById("profile-avatar-image"),
  profileAvatarPlaceholder: document.getElementById("profile-avatar-placeholder"),
  profileAvatarInitials: document.getElementById("profile-avatar-initials"),
  profileAvatarInput: document.getElementById("profile-avatar-input"),
  profileAvatarDelete: document.getElementById("profile-avatar-delete"),
  profileDisplayName: document.getElementById("profile-display-name"),
  profileDisplayNameSave: document.getElementById("profile-display-name-save"),
  profileUsername: document.getElementById("profile-username"),
  profileEmail: document.getElementById("profile-email"),
  profileCreatedAt: document.getElementById("profile-created-at"),
  profileStatus: document.getElementById("profile-status"),
  profileActiveTest: document.getElementById("profile-active-test"),
  profileEditTestButton: document.getElementById("profile-edit-test"),
  profileViewStatsButton: document.getElementById("profile-view-stats"),
  statsBackButton: document.getElementById("stats-back"),
  statsRefreshButton: document.getElementById("stats-refresh"),
  statsFilterTestSelect: document.getElementById("stats-filter-test"),
  statsFilterStartDate: document.getElementById("stats-filter-start-date"),
  statsFilterEndDate: document.getElementById("stats-filter-end-date"),
  statsFilterResetButton: document.getElementById("stats-filter-reset"),
  statsViewSingleTab: document.getElementById("stats-view-single"),
  statsViewAggregateTab: document.getElementById("stats-view-aggregate"),
  statsSingleControls: document.getElementById("stats-single-controls"),
  statsAttemptSelect: document.getElementById("stats-attempt-select"),
  statsAttemptList: document.getElementById("stats-attempt-list"),
  statsKpiGrid: document.getElementById("stats-kpi-grid"),
  statsChartAttempts: document.getElementById("stats-chart-attempts"),
  statsChartTime: document.getElementById("stats-chart-time"),
  statsQuestionStream: document.getElementById("stats-question-stream"),
  statsQuestionPreview: document.getElementById("stats-question-preview"),
  statsPreviewTitle: document.getElementById("stats-preview-title"),
  statsPreviewContent: document.getElementById("stats-preview-content"),
  statsPreviewClose: document.getElementById("stats-preview-close"),
  statsEmptyState: document.getElementById("stats-empty"),
  statsStartTestButton: document.getElementById("stats-start-test"),
  // Access settings modal
  accessSettingsModal: document.getElementById("access-settings-modal"),
  closeAccessSettingsButton: document.getElementById("close-access-settings"),
  accessSettingsTestName: document.getElementById("access-settings-test-name"),
  accessLevelSelect: document.getElementById("access-level-select"),
  accessLevelStatus: document.getElementById("access-level-status"),
  sharesSection: document.getElementById("shares-section"),
  shareUsernameInput: document.getElementById("share-username-input"),
  addShareButton: document.getElementById("add-share-button"),
  shareStatus: document.getElementById("share-status"),
  sharesList: document.getElementById("shares-list"),
  // Change requests modal
  changeRequestsModal: document.getElementById("change-requests-modal"),
  closeChangeRequestsButton: document.getElementById("close-change-requests"),
  changeRequestsRefreshButton: document.getElementById("change-requests-refresh"),
  changeRequestsTestName: document.getElementById("change-requests-test-name"),
  changeRequestsStats: document.getElementById("change-requests-stats"),
  changeRequestsStatus: document.getElementById("change-requests-status"),
  changeRequestsList: document.getElementById("change-requests-list"),
  // Editor change requests button
  editorChangeRequestsButton: document.getElementById("editor-change-requests"),
  // Test statistics modal (owner only)
  testStatsModal: document.getElementById("test-stats-modal"),
  // Settings
  settingQuestionCount: document.getElementById("setting-question-count"),
  settingRandomQuestions: document.getElementById(
    "setting-random-questions"
  ),
  settingRandomOptions: document.getElementById("setting-random-options"),
  settingOnlyUnanswered: document.getElementById(
    "setting-only-unanswered"
  ),
  settingShowAnswers: document.getElementById("setting-show-answers"),
  settingMaxOptions: document.getElementById("setting-max-options"),
};

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".wmf",
  ".emf",
];

export const INLINE_MARKER_REGEX = /{{\s*(image|formula)\s*:\s*([^}]+)\s*}}/g;

const TESTS_CACHE_KEY = "tests-cache";
const TESTS_CACHE_VERSION = "v1";
const TESTS_CACHE_TTL_MS = 10 * 60 * 1000;
const LAST_RESULT_KEY_PREFIX = "test-last-result:";
const ERROR_COUNTS_KEY_PREFIX = "test-error-counts:";
const ACTIVE_SESSION_KEY_PREFIX = "test-session:";
const ACTIVE_SESSION_VERSION = "v1";

export const state = {
  currentTest: null,
  testsCache: [],
  session: null,
  currentUser: null,
  editorState: {
    mode: "create",
    questionId: null,
    objects: [],
  },
  uiState: {
    activeScreen: "auth",
    locale: "ru",
    activeTestingPanel: "settings",
    activeTestFilter: null,
  },
  stats: {
    attempts: [],
    selectedAttemptId: null,
    attemptDetails: null,
    filterTestId: null,
    filterStartDate: null,
    filterEndDate: null,
    total: 0,
    viewMode: "single", // "single" or "aggregate"
  },
  activeEditorCard: null,
  activeEditorCardKey: null,
};

export const editorMobileQuery = window.matchMedia("(max-width: 720px)");

export function readTestsCache() {
  const raw = localStorage.getItem(TESTS_CACHE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const payload = JSON.parse(raw);
    if (payload?.version !== TESTS_CACHE_VERSION) {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    if (typeof payload?.savedAt !== "number") {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    const age = Date.now() - payload.savedAt;
    if (age < 0 || age > TESTS_CACHE_TTL_MS) {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    if (!Array.isArray(payload?.data)) {
      localStorage.removeItem(TESTS_CACHE_KEY);
      return [];
    }
    return payload.data;
  } catch (error) {
    return [];
  }
}

export function writeTestsCache(tests) {
  state.testsCache = tests;
  const payload = {
    version: TESTS_CACHE_VERSION,
    savedAt: Date.now(),
    data: tests,
  };
  localStorage.setItem(TESTS_CACHE_KEY, JSON.stringify(payload));
}

export function clearTestsCache() {
  state.testsCache = [];
  localStorage.removeItem(TESTS_CACHE_KEY);
}

export function loadProgress(testId) {
  if (!testId) {
    return new Set();
  }
  const raw = localStorage.getItem(`test-progress:${testId}`);
  if (!raw) {
    return new Set();
  }
  try {
    const data = JSON.parse(raw);
    return new Set(Array.isArray(data) ? data : []);
  } catch (error) {
    return new Set();
  }
}

export function saveProgress(testId, answeredIds) {
  if (!testId) {
    return;
  }
  const payload = Array.from(answeredIds);
  localStorage.setItem(`test-progress:${testId}`, JSON.stringify(payload));
}

function buildOptionOrderIndex(entry, options) {
  if (!entry || !Array.isArray(options)) {
    return [];
  }
  return options
    .map((option) => entry.question.options.indexOf(option))
    .filter((index) => index >= 0);
}

export function saveActiveSession(session) {
  if (!session?.testId) {
    return;
  }
  if (session.finished) {
    clearActiveSession(session.testId);
    return;
  }
  const payload = {
    version: ACTIVE_SESSION_VERSION,
    testId: session.testId,
    questionOrder: session.questions.map((entry) => entry.questionId),
    currentIndex: session.currentIndex,
    answers: Array.from(session.answers.entries()),
    answerStatus: Array.from(session.answerStatus.entries()),
    optionOrders: Array.from(session.optionOrders.entries()).map(
      ([questionId, options]) => {
        const entry = session.questions.find((item) => item.questionId === questionId);
        return {
          questionId,
          order: buildOptionOrderIndex(entry, options),
        };
      }
    ),
    settings: session.settings,
    attemptId: session.attemptId,
    clientId: session.clientId,
    startedAt: session.startedAt,
    activeQuestionId: session.activeQuestionId,
    activeQuestionStartedAt: session.activeQuestionStartedAt,
    questionShownAt: session.questionShownAt,
    lastRenderedQuestionId: session.lastRenderedQuestionId,
    questionTimings: Array.from(session.questionTimings.entries()),
    finished: Boolean(session.finished),
  };
  localStorage.setItem(
    `${ACTIVE_SESSION_KEY_PREFIX}${session.testId}`,
    JSON.stringify(payload)
  );
}

export function clearActiveSession(testId) {
  if (!testId) {
    return;
  }
  localStorage.removeItem(`${ACTIVE_SESSION_KEY_PREFIX}${testId}`);
}

export function loadActiveSession(test) {
  if (!test?.id) {
    return null;
  }
  const raw = localStorage.getItem(`${ACTIVE_SESSION_KEY_PREFIX}${test.id}`);
  if (!raw) {
    return null;
  }
  try {
    const payload = JSON.parse(raw);
    if (payload?.version !== ACTIVE_SESSION_VERSION) {
      return null;
    }
    if (payload?.testId !== test.id || payload.finished) {
      return null;
    }
    const questionMap = new Map();
    test.questions.forEach((question, index) => {
      const questionId = question.id ?? index + 1;
      questionMap.set(questionId, { question, questionId, originalIndex: index });
    });
    const questions = Array.isArray(payload.questionOrder)
      ? payload.questionOrder
          .map((questionId) => questionMap.get(questionId))
          .filter(Boolean)
      : [];
    if (!questions.length) {
      return null;
    }
    const optionOrders = new Map();
    if (Array.isArray(payload.optionOrders)) {
      payload.optionOrders.forEach((entry) => {
        const questionEntry = questions.find(
          (item) => item.questionId === entry.questionId
        );
        if (!questionEntry || !Array.isArray(entry.order)) {
          return;
        }
        const orderedOptions = entry.order
          .map((index) => questionEntry.question.options[index])
          .filter(Boolean);
        if (orderedOptions.length) {
          optionOrders.set(entry.questionId, orderedOptions);
        }
      });
    }
    const answers = new Map(Array.isArray(payload.answers) ? payload.answers : []);
    const answerStatus = new Map(
      Array.isArray(payload.answerStatus) ? payload.answerStatus : []
    );
    const questionTimings = new Map(
      Array.isArray(payload.questionTimings) ? payload.questionTimings : []
    );
    const currentIndex = Number.isFinite(payload.currentIndex)
      ? Math.min(
          Math.max(0, payload.currentIndex),
          Math.max(0, questions.length - 1)
        )
      : 0;
    const settings = {
      ...getSettings(),
      ...(payload.settings ?? {}),
    };
    return {
      testId: test.id,
      questions,
      currentIndex,
      answers,
      answerStatus,
      optionOrders,
      finished: false,
      settings,
      attemptId: payload.attemptId,
      clientId: payload.clientId,
      startedAt: payload.startedAt,
      activeQuestionId: payload.activeQuestionId ?? null,
      activeQuestionStartedAt: payload.activeQuestionStartedAt ?? null,
      questionShownAt: payload.questionShownAt ?? null,
      lastRenderedQuestionId: payload.lastRenderedQuestionId ?? null,
      questionTimings,
    };
  } catch (error) {
    return null;
  }
}

export function loadErrorCounts(testId) {
  if (!testId) {
    return {};
  }
  const raw = localStorage.getItem(`${ERROR_COUNTS_KEY_PREFIX}${testId}`);
  if (!raw) {
    return {};
  }
  try {
    const payload = JSON.parse(raw);
    return typeof payload === "object" && payload !== null ? payload : {};
  } catch (error) {
    return {};
  }
}

export function saveErrorCounts(testId, counts) {
  if (!testId) {
    return;
  }
  localStorage.setItem(
    `${ERROR_COUNTS_KEY_PREFIX}${testId}`,
    JSON.stringify(counts ?? {})
  );
}

export function clearErrorCounts(testId) {
  if (!testId) {
    return;
  }
  localStorage.removeItem(`${ERROR_COUNTS_KEY_PREFIX}${testId}`);
}

export function getErrorCount(counts, questionId) {
  if (!counts || (typeof counts !== "object" && typeof counts !== "function")) {
    return 0;
  }
  const key = String(questionId ?? "");
  const raw = counts[key];
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    return Math.trunc(raw);
  }
  return 0;
}

export function loadLastResult(testId) {
  if (!testId) {
    return null;
  }
  const raw = localStorage.getItem(`${LAST_RESULT_KEY_PREFIX}${testId}`);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (typeof data?.percent !== "number") {
      return null;
    }
    return data;
  } catch (error) {
    return null;
  }
}

export function saveLastResult(testId, stats) {
  if (!testId || !stats) {
    return;
  }
  localStorage.setItem(
    `${LAST_RESULT_KEY_PREFIX}${testId}`,
    JSON.stringify(stats)
  );
}

export function clearLastResult(testId) {
  if (!testId) {
    return;
  }
  localStorage.removeItem(`${LAST_RESULT_KEY_PREFIX}${testId}`);
}

export function getSettings() {
  return {
    questionCount:
      Number.parseInt(dom.settingQuestionCount.value || "0", 10) || 0,
    randomQuestions: dom.settingRandomQuestions.checked,
    randomOptions: dom.settingRandomOptions.checked,
    onlyUnanswered: dom.settingOnlyUnanswered.checked,
    showAnswersImmediately: dom.settingShowAnswers.checked,
    maxOptions: Math.max(
      1,
      Number.parseInt(dom.settingMaxOptions.value || "1", 10) || 1
    ),
  };
}
