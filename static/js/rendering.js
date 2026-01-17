import {
  dom,
  loadLastResult,
  loadProgress,
  saveProgress,
  state,
} from "./state.js";
import { formatNumber, t } from "./i18n.js";
import {
  flushQueues,
  trackAnswerEvent,
  trackQuestionShown,
  trackQuestionSkipped,
  updateQuestionTiming,
} from "./telemetry.js";

const MATHJAX_IDLE_TIMEOUT_MS = 120;
const NAV_RENDER_BATCH_SIZE = 60;
const NAV_IDLE_TIMEOUT_MS = 120;
const mathJaxQueue = new Set();
let mathJaxScheduled = false;
let lastQuestionNavSession = null;
let questionNavRenderToken = 0;

function queueMathJaxTypeset(container) {
  if (!container || !window.MathJax?.typesetPromise) {
    return;
  }
  mathJaxQueue.add(container);
  if (mathJaxScheduled) {
    return;
  }
  mathJaxScheduled = true;
  const runTypeset = () => {
    mathJaxScheduled = false;
    if (!mathJaxQueue.size) {
      return;
    }
    const targets = Array.from(mathJaxQueue);
    mathJaxQueue.clear();
    window.MathJax.typesetPromise(targets);
  };
  if (window.requestIdleCallback) {
    window.requestIdleCallback(runTypeset, { timeout: MATHJAX_IDLE_TIMEOUT_MS });
  } else {
    window.requestAnimationFrame(runTypeset);
  }
}

function updateQuestionNavButtonState(button, entry, index) {
  button.classList.remove(
    "is-correct",
    "is-incorrect",
    "is-neutral",
    "is-current"
  );
  const status = state.session.answerStatus.get(entry.questionId);
  if (state.session.finished) {
    if (status === "correct") {
      button.classList.add("is-correct");
    } else if (status === "incorrect") {
      button.classList.add("is-incorrect");
    }
  } else if (state.session.settings.showAnswersImmediately) {
    if (status === "correct") {
      button.classList.add("is-correct");
    } else if (status === "incorrect") {
      button.classList.add("is-incorrect");
    }
  } else {
    button.classList.add("is-neutral");
  }

  if (index === state.session.currentIndex) {
    button.classList.add("is-current");
  }
}

function createQuestionNavButton(entry, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = formatNumber(index + 1);
  button.className = "nav-button";
  updateQuestionNavButtonState(button, entry, index);
  button.addEventListener("click", () => {
    if (state.session) {
      const currentEntry =
        state.session.questions[state.session.currentIndex];
      if (currentEntry) {
        const selected = state.session.answers.get(currentEntry.questionId);
        if (selected === undefined || selected === -1) {
          const durationMs =
            typeof state.session.activeQuestionStartedAt === "number"
              ? Math.max(0, Date.now() - state.session.activeQuestionStartedAt)
              : 0;
          trackQuestionSkipped(
            state.session,
            currentEntry,
            state.session.currentIndex,
            durationMs
          );
          flushQueues();
        }
      }
      updateQuestionTiming(state.session, entry.questionId);
    }
    state.session.currentIndex = index;
    renderQuestion();
  });
  return button;
}

function scheduleQuestionNavRender(entries) {
  questionNavRenderToken += 1;
  const token = questionNavRenderToken;
  clearElement(dom.questionList);
  dom.questionList.dataset.navCount = String(entries.length);
  let currentIndex = 0;

  const renderChunk = () => {
    if (token !== questionNavRenderToken) {
      return;
    }
    const fragment = document.createDocumentFragment();
    let rendered = 0;
    while (currentIndex < entries.length && rendered < NAV_RENDER_BATCH_SIZE) {
      fragment.appendChild(
        createQuestionNavButton(entries[currentIndex], currentIndex)
      );
      currentIndex += 1;
      rendered += 1;
    }
    dom.questionList.appendChild(fragment);
    if (currentIndex < entries.length) {
      scheduleNextChunk();
    }
  };

  const scheduleNextChunk = () => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(renderChunk, { timeout: NAV_IDLE_TIMEOUT_MS });
    } else {
      window.requestAnimationFrame(renderChunk);
    }
  };

  scheduleNextChunk();
}

export function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function renderManagementScreen() {
  if (dom.screenManagement) {
    dom.screenManagement.classList.remove("is-hidden");
    dom.screenManagement.classList.add("is-active");
  }
  if (dom.screenTesting) {
    dom.screenTesting.classList.add("is-hidden");
    dom.screenTesting.classList.remove("is-active");
  }
  if (dom.screenStats) {
    dom.screenStats.classList.add("is-hidden");
    dom.screenStats.classList.remove("is-active");
  }
}

export function renderTestingScreen() {
  if (dom.screenTesting) {
    dom.screenTesting.classList.remove("is-hidden");
    dom.screenTesting.classList.add("is-active");
  }
  if (dom.screenManagement) {
    dom.screenManagement.classList.add("is-hidden");
    dom.screenManagement.classList.remove("is-active");
  }
  if (dom.screenStats) {
    dom.screenStats.classList.add("is-hidden");
    dom.screenStats.classList.remove("is-active");
  }
}

export function renderStatsScreen() {
  if (dom.screenStats) {
    dom.screenStats.classList.remove("is-hidden");
    dom.screenStats.classList.add("is-active");
  }
  if (dom.screenManagement) {
    dom.screenManagement.classList.add("is-hidden");
    dom.screenManagement.classList.remove("is-active");
  }
  if (dom.screenTesting) {
    dom.screenTesting.classList.add("is-hidden");
    dom.screenTesting.classList.remove("is-active");
  }
}

export function setActiveScreen(screen) {
  if (!screen || screen === state.uiState.activeScreen) {
    return;
  }
  state.uiState.activeScreen = screen;
  if (screen === "testing") {
    renderTestingScreen();
  } else if (screen === "stats") {
    renderStatsScreen();
  } else {
    renderManagementScreen();
  }
}

export function updateEditorTestActions() {
  const hasTest = Boolean(state.currentTest);
  if (dom.editorRenameTestButton) {
    dom.editorRenameTestButton.disabled = !hasTest;
    dom.editorRenameTestButton.textContent = hasTest
      ? t("editorRenameTitle", { title: state.currentTest.title })
      : t("renameTestButton");
  }
  if (dom.editorDeleteTestButton) {
    dom.editorDeleteTestButton.disabled = !hasTest;
    dom.editorDeleteTestButton.textContent = hasTest
      ? t("editorDeleteTitle", { title: state.currentTest.title })
      : t("deleteTestButton");
  }
}

export function renderUploadLogs(messages, isError = false) {
  if (!dom.uploadLogs) {
    return;
  }
  clearElement(dom.uploadLogs);
  dom.uploadLogs.classList.toggle("is-error", isError);

  if (!messages) {
    return;
  }

  const logItems = Array.isArray(messages) ? messages : [messages];
  logItems.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    dom.uploadLogs.appendChild(item);
  });
}

export function renderInline(parent, inline, { onFormula } = {}) {
  if (inline.type === "text") {
    parent.appendChild(document.createTextNode(inline.text ?? ""));
    return;
  }
  if (inline.type === "line_break") {
    parent.appendChild(document.createElement("br"));
    return;
  }
  if (inline.type === "image") {
    const img = document.createElement("img");
    const src = inline.src
      ? `${state.currentTest.assetsBaseUrl}/${inline.src}`
      : "";
    img.src = src;
    img.alt = inline.alt || t("inlineImageAlt");
    img.loading = "lazy";
    img.className = "inline-image";
    parent.appendChild(img);
    return;
  }
  if (inline.type === "formula") {
    if (inline.mathml) {
      const span = document.createElement("span");
      span.innerHTML = inline.mathml;
      parent.appendChild(span);
      onFormula?.();
      return;
    }
    if (inline.latex) {
      const span = document.createElement("span");
      span.innerHTML = `\\(${inline.latex}\\)`;
      parent.appendChild(span);
      onFormula?.();
      return;
    }
    if (inline.src) {
      const img = document.createElement("img");
      img.src = `${state.currentTest.assetsBaseUrl}/${inline.src}`;
      img.alt = inline.id || t("inlineFormulaAlt");
      img.className = "inline-image";
      parent.appendChild(img);
      return;
    }
    // Формулы без src считаются штатным сценарием (MathML/LaTeX или плейсхолдер).
    parent.appendChild(document.createTextNode(t("inlineFormulaPlaceholder")));
  }
}

export function renderBlocks(container, blocks) {
  clearElement(container);
  let hasFormula = false;
  const markFormula = () => {
    hasFormula = true;
  };
  blocks.forEach((block) => {
    if (block.type === "paragraph") {
      const p = document.createElement("p");
      block.inlines.forEach((inline) =>
        renderInline(p, inline, { onFormula: markFormula })
      );
      container.appendChild(p);
    }
  });
  if (hasFormula) {
    queueMathJaxTypeset(container);
  }
}

export function updateProgressHint() {
  if (!state.currentTest) {
    dom.progressHint.textContent = "";
    return;
  }
  const progress = loadProgress(state.currentTest.id);
  const total = state.currentTest.questions.length;
  dom.progressHint.textContent = t("progressHint", {
    answered: formatNumber(progress.size),
    total: formatNumber(total),
  });
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getOptionsForQuestion(entry) {
  const cached = state.session.optionOrders.get(entry.questionId);
  if (cached) {
    return cached;
  }
  let options = [...entry.question.options];
  if (state.session.settings.randomOptions) {
    options = shuffle(options);
  }
  options = options.slice(0, state.session.settings.maxOptions);
  state.session.optionOrders.set(entry.questionId, options);
  return options;
}

function getAnswerFeedback(selectedIndex, correctIndex) {
  if (correctIndex === null) {
    return t("answerFeedbackNoCorrect");
  }
  if (selectedIndex === correctIndex) {
    return t("answerFeedbackCorrect");
  }
  return t("answerFeedbackIncorrect", {
    index: formatNumber(correctIndex + 1),
  });
}

export function renderQuestionNav() {
  if (!state.session) {
    return;
  }

  const shouldRebuild =
    state.session !== lastQuestionNavSession ||
    dom.questionList.dataset.navCount !==
      String(state.session.questions.length);

  if (shouldRebuild) {
    lastQuestionNavSession = state.session;
    scheduleQuestionNavRender(state.session.questions);
    return;
  }

  const buttons = dom.questionList.querySelectorAll("button.nav-button");
  buttons.forEach((button, index) => {
    const entry = state.session.questions[index];
    if (!entry) {
      return;
    }
    updateQuestionNavButtonState(button, entry, index);
  });
}

export function renderQuestion() {
  if (!state.session || !state.session.questions.length) {
    dom.questionContainer.textContent = t("noQuestionsToDisplay");
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = t("questionProgress", {
      current: formatNumber(0),
      total: formatNumber(0),
    });
    dom.questionStatus.textContent = "";
    if (dom.answerFeedback) {
      dom.answerFeedback.textContent = "";
    }
    return;
  }

  const entry = state.session.questions[state.session.currentIndex];
  const previousQuestionId = state.session.activeQuestionId;
  const options = getOptionsForQuestion(entry);
  const selectedIndex = state.session.answers.get(entry.questionId) ?? -1;
  const correctIndex = options.findIndex((option) => option.isCorrect);
  const resolvedCorrectIndex = correctIndex === -1 ? null : correctIndex;

  dom.questionProgress.textContent = t("questionProgress", {
    current: formatNumber(state.session.currentIndex + 1),
    total: formatNumber(state.session.questions.length),
  });
  dom.questionStatus.textContent = t("questionStatus", {
    id: formatNumber(entry.questionId),
  });

  renderBlocks(dom.questionContainer, entry.question.question.blocks);

  clearElement(dom.optionsContainer);
  dom.optionsContainer.classList.remove("is-hidden");
  const optionsTitle = document.createElement("h3");
  optionsTitle.textContent = t("optionsTitle");
  dom.optionsContainer.appendChild(optionsTitle);

  const optionsList = document.createElement("div");
  optionsList.className = "options-list";

  options.forEach((option, index) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "option-card";

    const indexBadge = document.createElement("span");
    indexBadge.className = "option-index";
    indexBadge.textContent = `${formatNumber(index + 1)}.`;

    const content = document.createElement("div");
    content.className = "option-content";
    renderBlocks(content, option.content.blocks);

    optionButton.append(indexBadge, content);

    const isSelected = selectedIndex === index;
    if (state.session.finished) {
      if (resolvedCorrectIndex === index) {
        optionButton.classList.add("is-correct");
      } else if (isSelected) {
        optionButton.classList.add("is-incorrect");
      }
      optionButton.disabled = true;
    } else if (
      state.session.settings.showAnswersImmediately &&
      selectedIndex !== -1
    ) {
      if (resolvedCorrectIndex === index) {
        optionButton.classList.add("is-correct");
      }
      if (isSelected && resolvedCorrectIndex !== index) {
        optionButton.classList.add("is-incorrect");
      }
    } else if (isSelected) {
      optionButton.classList.add("is-selected");
    }

    if (!state.session.finished) {
      optionButton.addEventListener("click", () => {
        const previousAnswer = state.session.answers.get(entry.questionId);
        state.session.answers.set(entry.questionId, index);
        if (resolvedCorrectIndex === null) {
          state.session.answerStatus.set(entry.questionId, "unanswered");
        } else if (index === resolvedCorrectIndex) {
          state.session.answerStatus.set(entry.questionId, "correct");
        } else {
          state.session.answerStatus.set(entry.questionId, "incorrect");
        }
        const progress = loadProgress(state.session.testId);
        progress.add(entry.questionId);
        saveProgress(state.session.testId, progress);
        updateProgressHint();
        const durationMs =
          typeof state.session.activeQuestionStartedAt === "number"
            ? Math.max(0, Date.now() - state.session.activeQuestionStartedAt)
            : 0;
        const isCorrect =
          resolvedCorrectIndex === null
            ? null
            : Boolean(options[index]?.isCorrect);
        const eventType =
          previousAnswer === undefined || previousAnswer === -1
            ? "answer_selected"
            : "answer_changed";
        trackAnswerEvent(
          eventType,
          state.session,
          entry,
          state.session.currentIndex,
          index,
          options,
          isCorrect,
          durationMs
        );
        flushQueues();
        if (state.session.settings.showAnswersImmediately && dom.answerFeedback) {
          dom.answerFeedback.textContent = getAnswerFeedback(
            index,
            resolvedCorrectIndex
          );
        }
        renderQuestion();
      });
    }

    optionsList.appendChild(optionButton);
  });

  dom.optionsContainer.appendChild(optionsList);

  if (dom.answerFeedback) {
    if (!state.session.settings.showAnswersImmediately || state.session.finished) {
      dom.answerFeedback.textContent = "";
    } else if (selectedIndex !== -1) {
      dom.answerFeedback.textContent = getAnswerFeedback(
        selectedIndex,
        resolvedCorrectIndex
      );
    } else {
      dom.answerFeedback.textContent = t("selectAnswerHint");
    }
  }

  dom.prevQuestionButton.disabled = state.session.currentIndex === 0;
  dom.nextQuestionButton.disabled =
    state.session.currentIndex >= state.session.questions.length - 1;

  renderQuestionNav();

  updateQuestionTiming(state.session, entry.questionId);
  if (previousQuestionId !== entry.questionId) {
    trackQuestionShown(state.session, entry, state.session.currentIndex);
  }
}

export function renderResultSummary(stats) {
  clearElement(dom.resultDetails);
  if (!stats) {
    dom.resultSummary.textContent = t("noCompletedAttempts");
    return;
  }
  const { correct, total, answered, percent } = stats;
  const formattedPercent = formatNumber(percent, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  dom.resultSummary.textContent = t("resultSummary", {
    correct: formatNumber(correct),
    total: formatNumber(total),
    answered: formatNumber(answered),
    percent: formattedPercent,
  });
  const detailItems = [
    t("resultDetailTotal", { total: formatNumber(total) }),
    t("resultDetailAnswered", { answered: formatNumber(answered) }),
    t("resultDetailAccuracy", { percent: formattedPercent }),
  ];
  detailItems.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    dom.resultDetails.appendChild(item);
  });
}

export function renderTestCards(
  tests,
  selectedId,
  {
    onCreateTest = () => {},
    onImportTest = () => {},
    onSelectTest = () => {},
    onStartTesting = async () => {},
    onEditTest = async () => {},
    onViewStats = async () => {},
  } = {}
) {
  clearElement(dom.testCardsContainer);

  const newCard = document.createElement("button");
  newCard.type = "button";
  newCard.className = "test-card test-card--new";
  const newCardTitle = document.createElement("strong");
  newCardTitle.textContent = t("newCollectionTitle");
  const newCardHint = document.createElement("span");
  newCardHint.className = "muted";
  newCardHint.textContent = t("newCollectionHint");
  newCard.append(newCardTitle, newCardHint);
  newCard.addEventListener("click", () => {
    onCreateTest();
  });
  dom.testCardsContainer.appendChild(newCard);

  const importCard = document.createElement("button");
  importCard.type = "button";
  importCard.className = "test-card test-card--import";
  const importCardTitle = document.createElement("strong");
  importCardTitle.textContent = t("importTestTitle");
  const importCardHint = document.createElement("span");
  importCardHint.className = "muted";
  importCardHint.textContent = t("importTestHint");
  importCard.append(importCardTitle, importCardHint);
  importCard.addEventListener("click", () => {
    onImportTest();
  });
  dom.testCardsContainer.appendChild(importCard);

  if (!tests.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = t("noTestsAvailable");
    dom.testCardsContainer.appendChild(empty);
    return;
  }

  tests.forEach((test) => {
    const card = document.createElement("div");
    card.className = "test-card";
    card.dataset.testId = test.id;
    if (test.id === selectedId) {
      card.classList.add("is-active");
    }

    const title = document.createElement("h3");
    title.className = "test-card__title";
    title.textContent = test.title;

    const meta = document.createElement("div");
    meta.className = "test-card__meta";
    meta.textContent = t("testCount", {
      count: formatNumber(test.questionCount),
    });

    const stats = document.createElement("div");
    stats.className = "test-card__stats";
    const lastResult = loadLastResult(test.id);
    if (lastResult) {
      const formattedPercent = formatNumber(lastResult.percent, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      stats.textContent = t("lastResult", {
        correct: formatNumber(lastResult.correct),
        total: formatNumber(lastResult.total),
        percent: formattedPercent,
      });
    } else {
      stats.textContent = t("lastResultEmpty");
    }

    const actions = document.createElement("div");
    actions.className = "test-card__actions";

    const testingButton = document.createElement("button");
    testingButton.type = "button";
    testingButton.textContent = t("testingButton");
    testingButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await onStartTesting(test.id);
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary";
    editButton.textContent = t("editingButton");
    editButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await onEditTest(test.id);
    });

    const statsButton = document.createElement("button");
    statsButton.type = "button";
    statsButton.className = "ghost";
    statsButton.textContent = t("statsButton");
    statsButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await onViewStats(test.id);
    });

    actions.append(testingButton, editButton, statsButton);
    card.append(title, meta, stats, actions);
    card.addEventListener("click", async () => {
      await onSelectTest(test.id);
    });

    dom.testCardsContainer.appendChild(card);
  });
}

let statsAttemptsChart = null;
let statsTimeChart = null;

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "—";
  }
  const seconds = Math.max(0, Math.round(ms / 1000));
  const formatter = new Intl.NumberFormat(state.uiState.locale, {
    style: "unit",
    unit: "second",
    unitDisplay: "short",
  });
  if (seconds < 60) {
    return formatter.format(seconds);
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  const minuteFormatter = new Intl.NumberFormat(state.uiState.locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  });
  return `${minuteFormatter.format(minutes)} ${formatter.format(remaining)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${formatNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return formatPercent(value * 100);
}

function resolveAggregateValue(aggregate, keys) {
  if (!aggregate || typeof aggregate !== "object") {
    return null;
  }
  for (const key of keys) {
    if (Number.isFinite(aggregate[key])) {
      return aggregate[key];
    }
  }
  return null;
}

function resolveAttemptAggregate(attempt) {
  if (!attempt || typeof attempt !== "object") {
    return {};
  }
  return attempt.summary ?? attempt.aggregates ?? {};
}

function createKpiCard({ label, value, hint }) {
  const card = document.createElement("div");
  card.className = "kpi-card";
  const labelEl = document.createElement("span");
  labelEl.className = "muted";
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  card.append(labelEl, valueEl);
  if (hint) {
    const hintEl = document.createElement("span");
    hintEl.className = "kpi-hint muted";
    hintEl.textContent = hint;
    card.appendChild(hintEl);
  }
  return card;
}

function getAttemptLabel(attempt, index) {
  if (!attempt) {
    return formatNumber(index + 1);
  }
  const dateValue = attempt.finalizedAt || attempt.createdAt;
  if (dateValue) {
    const date = new Date(dateValue);
    if (!Number.isNaN(date.valueOf())) {
      return date.toLocaleDateString(state.uiState.locale, {
        day: "2-digit",
        month: "short",
      });
    }
  }
  return formatNumber(index + 1);
}

function getAttemptTitle(attempt, index) {
  const dateValue = attempt?.finalizedAt || attempt?.createdAt;
  if (dateValue) {
    const date = new Date(dateValue);
    if (!Number.isNaN(date.valueOf())) {
      return date.toLocaleString(state.uiState.locale, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return t("statsAttemptTitle", { index: formatNumber(index + 1) });
}

function buildChartConfig({ labels, data, label, color, fillColor }) {
  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          backgroundColor: fillColor,
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--muted"
            ),
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--border"
            ),
          },
        },
        x: {
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--muted"
            ),
          },
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => `${label}: ${context.parsed.y}`,
          },
        },
      },
    },
  };
}

function renderStatsAttemptList(attempts, selectedAttemptId, tests) {
  if (!dom.statsAttemptList) {
    return;
  }
  clearElement(dom.statsAttemptList);
  if (!attempts.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = t("statsNoAttempts");
    dom.statsAttemptList.appendChild(empty);
    return;
  }
  const testById = new Map(tests.map((test) => [test.id, test.title]));
  attempts.forEach((attempt, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-attempt";
    button.dataset.attemptId = attempt.attemptId;
    if (attempt.attemptId === selectedAttemptId) {
      button.classList.add("is-active");
    }
    const title = document.createElement("strong");
    title.textContent = getAttemptTitle(attempt, index);
    const meta = document.createElement("span");
    meta.className = "muted";
    const testTitle = testById.get(attempt.testId) || attempt.testId;
    meta.textContent = t("statsAttemptMeta", { title: testTitle });
    const metrics = document.createElement("span");
    metrics.className = "stats-attempt__metric";
    const aggregate = resolveAttemptAggregate(attempt);
    const percent =
      resolveAggregateValue(aggregate, ["percentCorrect", "accuracy"]) ??
      (() => {
        const score = resolveAggregateValue(aggregate, ["score", "correct"]);
        const total = resolveAggregateValue(aggregate, ["total", "totalCount"]);
        if (Number.isFinite(score) && Number.isFinite(total) && total > 0) {
          return (score / total) * 100;
        }
        return null;
      })();
    metrics.textContent = percent !== null ? formatPercent(percent) : "—";
    button.append(title, meta, metrics);
    item.appendChild(button);
    dom.statsAttemptList.appendChild(item);
  });
}

function renderStatsAttemptSelect(attempts, selectedAttemptId) {
  if (!dom.statsAttemptSelect) {
    return;
  }
  clearElement(dom.statsAttemptSelect);
  if (!attempts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("statsNoAttempts");
    dom.statsAttemptSelect.appendChild(option);
    dom.statsAttemptSelect.disabled = true;
    return;
  }
  dom.statsAttemptSelect.disabled = false;
  attempts.forEach((attempt, index) => {
    const option = document.createElement("option");
    option.value = attempt.attemptId;
    option.textContent = getAttemptTitle(attempt, index);
    dom.statsAttemptSelect.appendChild(option);
  });
  dom.statsAttemptSelect.value = selectedAttemptId || attempts[0].attemptId;
}

function renderStatsKpis({ attempts, selectedAttempt }) {
  if (!dom.statsKpiGrid) {
    return;
  }
  clearElement(dom.statsKpiGrid);
  const aggregate = resolveAttemptAggregate(selectedAttempt);
  const score = resolveAggregateValue(aggregate, ["score", "correct"]);
  const total = resolveAggregateValue(aggregate, ["total", "totalCount"]);
  const percent =
    resolveAggregateValue(aggregate, ["percentCorrect", "accuracy"]) ??
    (Number.isFinite(score) && Number.isFinite(total) && total > 0
      ? (score / total) * 100
      : null);
  const answered = resolveAggregateValue(aggregate, ["answeredCount"]);
  const avgTime = resolveAggregateValue(aggregate, ["avgTimePerQuestion"]);
  const totalDuration = resolveAggregateValue(aggregate, ["totalDurationMs"]);
  const focusIndex = resolveAggregateValue(aggregate, ["focusStabilityIndex"]);
  const fatigueIndex = resolveAggregateValue(aggregate, ["fatiguePoint"]);

  const cards = [
    createKpiCard({
      label: t("statsKpiAttempts"),
      value: formatNumber(attempts.length),
    }),
    createKpiCard({
      label: t("statsKpiAccuracy"),
      value: percent !== null ? formatPercent(percent) : "—",
      hint:
        score !== null && total !== null
          ? t("statsKpiAccuracyHint", {
              correct: formatNumber(score),
              total: formatNumber(total),
            })
          : null,
    }),
    createKpiCard({
      label: t("statsKpiAnswered"),
      value:
        answered !== null
          ? formatNumber(answered)
          : total !== null
            ? formatNumber(total)
            : "—",
    }),
    createKpiCard({
      label: t("statsKpiAvgTime"),
      value: avgTime !== null ? formatDuration(avgTime) : "—",
    }),
    createKpiCard({
      label: t("statsKpiTotalTime"),
      value: totalDuration !== null ? formatDuration(totalDuration) : "—",
    }),
    createKpiCard({
      label: t("statsKpiFocus"),
      value: focusIndex !== null ? formatRatio(focusIndex) : "—",
      hint:
        fatigueIndex !== null
          ? t("statsKpiFatigueHint", {
              value: formatRatio(fatigueIndex),
            })
          : null,
    }),
  ];
  cards.forEach((card) => dom.statsKpiGrid.appendChild(card));
}

function renderStatsQuestionStream(selectedAttempt) {
  if (!dom.statsQuestionStream) {
    return;
  }
  clearElement(dom.statsQuestionStream);
  const summary = selectedAttempt?.summary;
  const items = Array.isArray(summary?.perQuestion) ? summary.perQuestion : [];
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = t("statsNoQuestionData");
    dom.statsQuestionStream.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "stats-question-item";
    if (item.isSkipped) {
      entry.classList.add("is-skipped");
    } else if (item.isCorrect) {
      entry.classList.add("is-correct");
    } else {
      entry.classList.add("is-incorrect");
    }
    const title = document.createElement("strong");
    title.textContent = t("statsQuestionTitle", {
      index: formatNumber((item.questionIndex ?? 0) + 1),
    });
    const subtitle = document.createElement("span");
    subtitle.className = "muted";
    subtitle.textContent = item.questionId
      ? t("statsQuestionId", { id: item.questionId })
      : "";

    const meta = document.createElement("div");
    meta.className = "stats-question-meta";
    const status = document.createElement("span");
    status.className = "stats-badge";
    if (item.isSkipped) {
      status.classList.add("stats-badge--neutral");
      status.textContent = t("statsQuestionSkipped");
    } else if (item.isCorrect) {
      status.classList.add("stats-badge--success");
      status.textContent = t("statsQuestionCorrect");
    } else {
      status.classList.add("stats-badge--danger");
      status.textContent = t("statsQuestionIncorrect");
    }
    const duration = document.createElement("span");
    duration.className = "muted";
    duration.textContent = formatDuration(item.durationMs || 0);
    meta.append(status, duration);

    const info = document.createElement("div");
    info.className = "stats-question-info";
    info.append(title, subtitle);
    entry.append(info, meta);
    dom.statsQuestionStream.appendChild(entry);
  });
}

function renderStatsCharts(selectedAttempt) {
  if (!dom.statsChartAttempts || !dom.statsChartTime) {
    return;
  }
  if (!window.Chart) {
    return;
  }

  const summary = selectedAttempt?.summary ?? selectedAttempt?.aggregates ?? {};
  const accuracyByIndex = Array.isArray(summary.accuracyByIndex)
    ? summary.accuracyByIndex
    : [];
  const timeByIndex = Array.isArray(summary.timeByIndex)
    ? summary.timeByIndex
    : [];
  const maxLen = Math.max(accuracyByIndex.length, timeByIndex.length);
  const labels = Array.from({ length: maxLen }, (_, index) =>
    formatNumber(index + 1)
  );
  const accuracyValues = accuracyByIndex.map((value) =>
    Number.isFinite(value) ? Number(value.toFixed(1)) : null
  );
  const timeValues = timeByIndex.map((value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Number((value / 1000).toFixed(1));
  });

  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue("--primary").trim();
  const primarySoft = styles.getPropertyValue("--primary-soft").trim();
  const success = styles.getPropertyValue("--success").trim();
  const successSoft = styles.getPropertyValue("--success-soft").trim();

  statsAttemptsChart?.destroy();
  statsTimeChart?.destroy();

  statsAttemptsChart = new window.Chart(
    dom.statsChartAttempts.getContext("2d"),
    buildChartConfig({
      labels,
      data: accuracyValues,
      label: t("statsChartAttemptsLegend"),
      color: primary,
      fillColor: primarySoft,
    })
  );

  statsTimeChart = new window.Chart(
    dom.statsChartTime.getContext("2d"),
    buildChartConfig({
      labels,
      data: timeValues,
      label: t("statsChartTimeLegend"),
      color: success,
      fillColor: successSoft,
    })
  );
}

export function renderStatsView() {
  const { attempts, selectedAttemptId, attemptDetails } = state.stats;
  const filteredAttempts = Array.isArray(attempts) ? attempts : [];
  const selectedAttempt =
    attemptDetails?.attempt ||
    filteredAttempts.find((attempt) => attempt.attemptId === selectedAttemptId) ||
    null;

  if (dom.statsEmptyState) {
    dom.statsEmptyState.classList.toggle(
      "is-hidden",
      filteredAttempts.length > 0
    );
  }

  renderStatsAttemptSelect(filteredAttempts, selectedAttemptId);
  renderStatsAttemptList(
    filteredAttempts,
    selectedAttemptId,
    state.testsCache
  );
  renderStatsKpis({ attempts: filteredAttempts, selectedAttempt });
  renderStatsQuestionStream(selectedAttempt);
  if (selectedAttempt) {
    renderStatsCharts(selectedAttempt);
  } else {
    statsAttemptsChart?.destroy();
    statsTimeChart?.destroy();
    statsAttemptsChart = null;
    statsTimeChart = null;
  }
}
