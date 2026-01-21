/**
 * Testing Screen - Test taking functionality
 */

import { t, formatNumber } from "../i18n.js";
import {
  renderQuestion,
  renderQuestionNav,
  renderResultSummary,
  setActiveScreen,
} from "../rendering.js";
import {
  clearErrorCounts,
  clearActiveSession,
  dom,
  getErrorCount,
  getSettings,
  loadErrorCounts,
  loadProgress,
  saveActiveSession,
  saveLastResult,
  state,
} from "../state.js";
import {
  buildAttemptSummary,
  createAttemptId,
  finalizeActiveQuestionTiming,
  flushQueues,
  getClientId,
  trackAttemptAbandoned,
  trackAttemptFinished,
  trackAttemptStarted,
  trackQuestionSkipped,
  updateQuestionTiming,
} from "../telemetry.js";

const TESTING_PANELS = ["settings", "results", "questions"];

/**
 * Update question count label
 */
export function updateQuestionCountLabel() {
  if (!dom.questionCountLabel) {
    return;
  }
  const count = state.currentTest?.questions?.length ?? 0;
  dom.questionCountLabel.textContent = t("testCount", {
    count: formatNumber(count),
  });
}

/**
 * Set active testing panel (settings/results/questions)
 */
export function setActiveTestingPanel(panelKey) {
  if (!TESTING_PANELS.includes(panelKey)) {
    return;
  }
  state.uiState.activeTestingPanel = panelKey;

  const panelMap = {
    settings: dom.settingsPanel,
    results: dom.resultsPanel,
    questions: dom.questionsPanel,
  };
  const toggleMap = {
    settings: dom.settingsPanelToggle,
    results: dom.resultsPanelToggle,
    questions: dom.questionsPanelToggle,
  };

  TESTING_PANELS.forEach((key) => {
    const panel = panelMap[key];
    const toggle = toggleMap[key];
    if (panel) {
      panel.classList.toggle("is-open", key === panelKey);
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(key === panelKey));
    }
  });
}

/**
 * Update testing panels status (show/hide buttons based on test state)
 */
export function updateTestingPanelsStatus() {
  const isTesting = Boolean(state.session && !state.session.finished);

  if (dom.finishTestButton) {
    dom.finishTestButton.classList.toggle("is-hidden", !isTesting);
    dom.finishTestButton.disabled = !isTesting;
  }

  if (dom.exitTestButton) {
    dom.exitTestButton.classList.toggle("is-hidden", isTesting);
    dom.exitTestButton.disabled = isTesting;
  }

  updateQuestionCountLabel();
}

/**
 * Build test session from test and settings
 */
export function buildSession(test, settings) {
  const progress = loadProgress(test.id);
  const errorCounts = loadErrorCounts(test.id);

  let questions = test.questions.map((question, index) => ({
    question,
    questionId: question.id ?? index + 1,
    originalIndex: index,
  }));

  if (settings.onlyUnanswered) {
    questions = questions.filter(
      (entry) => getErrorCount(errorCounts, entry.questionId) >= 0
    );
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
    finished: false,
    settings,
    attemptId: createAttemptId(),
    clientId: getClientId(),
    startedAt: Date.now(),
    activeQuestionId: null,
    activeQuestionStartedAt: null,
    questionShownAt: null,
    lastRenderedQuestionId: null,
    questionTimings: new Map(),
  };
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 */
export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Finish test and calculate results
 */
export function finishTest() {
  if (!state.session || state.session.finished) {
    return;
  }

  state.session.finished = true;
  finalizeActiveQuestionTiming(state.session);
  clearActiveSession(state.session.testId);

  let correct = 0;
  let answered = 0;

  state.session.questions.forEach((entry) => {
    const selected = state.session.answers.get(entry.questionId);
    if (selected === undefined || selected === -1) {
      return;
    }
    answered += 1;

    const options =
      state.session.optionOrders.get(entry.questionId) ??
      entry.question.options;
    if (options[selected]?.isCorrect) {
      correct += 1;
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

  const summary = buildAttemptSummary(state.session);
  trackAttemptFinished(state.session, summary);
  flushQueues();

  import("./management.js").then(({ renderTestCardsWithHandlers }) => {
    renderTestCardsWithHandlers(state.testsCache, state.session.testId);
  });

  renderResultSummary({ correct, total, answered, percent });
  renderQuestion();
  updateTestingPanelsStatus();
  setActiveTestingPanel("results");
}

/**
 * Start test with current settings
 */
export function startTest() {
  if (!state.currentTest) {
    dom.questionContainer.textContent = t("noTestSelected");
    return;
  }

  const settings = getSettings();
  clearActiveSession(state.currentTest.id);
  state.session = buildSession(state.currentTest, settings);
  trackAttemptStarted(state.session);
  saveActiveSession(state.session);
  renderResultSummary(null);
  updateTestingPanelsStatus();
  setActiveTestingPanel("questions");

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

/**
 * Initialize testing screen event listeners
 */
export function initializeTestingScreenEvents() {
  dom.settingsPanelToggle?.addEventListener("click", () => {
    setActiveTestingPanel("settings");
  });

  dom.resultsPanelToggle?.addEventListener("click", () => {
    setActiveTestingPanel("results");
  });

  dom.questionsPanelToggle?.addEventListener("click", () => {
    setActiveTestingPanel("questions");
  });

  dom.prevQuestionButton?.addEventListener("click", () => {
    if (!state.session) {
      return;
    }
    updateQuestionTiming(
      state.session,
      state.session.questions[Math.max(0, state.session.currentIndex - 1)]
        ?.questionId ?? null
    );
    state.session.currentIndex = Math.max(0, state.session.currentIndex - 1);
    renderQuestion();
    saveActiveSession(state.session);
  });

  dom.nextQuestionButton?.addEventListener("click", () => {
    if (!state.session) {
      return;
    }

    const currentEntry = state.session.questions[state.session.currentIndex];
    if (currentEntry) {
      const selected = state.session.answers.get(currentEntry.questionId);
      if (selected === undefined || selected === -1) {
        const durationMs =
          typeof state.session.questionShownAt === "number"
            ? Math.max(0, Date.now() - state.session.questionShownAt)
            : typeof state.session.activeQuestionStartedAt === "number"
              ? Math.max(0, Date.now() - state.session.activeQuestionStartedAt)
              : 0;
        trackQuestionSkipped(
          state.session,
          currentEntry,
          state.session.currentIndex,
          durationMs
        );
      }
    }

    updateQuestionTiming(
      state.session,
      state.session.questions[
        Math.min(
          state.session.questions.length - 1,
          state.session.currentIndex + 1
        )
      ]?.questionId ?? null
    );
    state.session.currentIndex = Math.min(
      state.session.questions.length - 1,
      state.session.currentIndex + 1
    );
    renderQuestion();
    saveActiveSession(state.session);
  });

  dom.finishTestButton?.addEventListener("click", () => {
    finishTest();
  });

  dom.startTestButton?.addEventListener("click", () => {
    startTest();
  });

  dom.exitTestButton?.addEventListener("click", () => {
    if (state.session && !state.session.finished) {
      finalizeActiveQuestionTiming(state.session);
      trackAttemptAbandoned(state.session);
      saveActiveSession(state.session);
    }
    setActiveScreen("management");
    dom.optionsContainer.classList.add("is-hidden");
  });
}
