import {
  dom,
  loadLastResult,
  loadProgress,
  saveProgress,
  state,
} from "./state.js";
import { formatNumber, t } from "./i18n.js";

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
}

export function setActiveScreen(screen) {
  if (!screen || screen === state.uiState.activeScreen) {
    return;
  }
  state.uiState.activeScreen = screen;
  if (screen === "testing") {
    renderTestingScreen();
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

export function renderInline(parent, inline) {
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
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([span]);
      }
      return;
    }
    if (inline.latex) {
      const span = document.createElement("span");
      span.innerHTML = `\\(${inline.latex}\\)`;
      parent.appendChild(span);
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
  blocks.forEach((block) => {
    if (block.type === "paragraph") {
      const p = document.createElement("p");
      block.inlines.forEach((inline) => renderInline(p, inline));
      container.appendChild(p);
    }
  });
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([container]);
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

export function recordCurrentQuestionDuration() {
  if (!state.session) {
    return;
  }
  const now = Date.now();
  const startedAt = state.session.questionStartedAt;
  if (typeof startedAt !== "number") {
    state.session.questionStartedAt = now;
    return;
  }
  const entry = state.session.questions[state.session.currentIndex];
  if (!entry) {
    state.session.questionStartedAt = now;
    return;
  }
  const elapsedMs = Math.max(0, now - startedAt);
  const previous = state.session.questionTimings.get(entry.questionId) || 0;
  state.session.questionTimings.set(entry.questionId, previous + elapsedMs);
  state.session.questionStartedAt = now;
}

export function setCurrentQuestion(index) {
  if (!state.session) {
    return;
  }
  recordCurrentQuestionDuration();
  state.session.currentIndex = index;
  renderQuestion();
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
  clearElement(dom.questionList);
  if (!state.session) {
    return;
  }

  state.session.questions.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = formatNumber(index + 1);
    button.className = "nav-button";

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

    button.addEventListener("click", () => {
      setCurrentQuestion(index);
    });

    dom.questionList.appendChild(button);
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
  if (typeof state.session.questionStartedAt !== "number") {
    state.session.questionStartedAt = Date.now();
  }
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
        state.session.answers.set(entry.questionId, index);
        if (resolvedCorrectIndex === null) {
          state.session.answerStatus.set(entry.questionId, "answered");
        } else if (index === resolvedCorrectIndex) {
          state.session.answerStatus.set(entry.questionId, "correct");
        } else {
          state.session.answerStatus.set(entry.questionId, "incorrect");
        }
        const progress = loadProgress(state.session.testId);
        progress.add(entry.questionId);
        saveProgress(state.session.testId, progress);
        updateProgressHint();
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

    actions.append(testingButton, editButton);
    card.append(title, meta, stats, actions);
    card.addEventListener("click", async () => {
      await onSelectTest(test.id);
    });

    dom.testCardsContainer.appendChild(card);
  });
}

function renderAnalyticsEmpty(container) {
  clearElement(container);
  const empty = document.createElement("p");
  empty.className = "analytics-empty";
  empty.textContent = t("analyticsNoData");
  container.appendChild(empty);
}

function buildMetric(label, value) {
  const card = document.createElement("div");
  card.className = "analytics-metric";
  const labelEl = document.createElement("span");
  labelEl.className = "analytics-metric__label";
  labelEl.textContent = label;
  const valueEl = document.createElement("div");
  valueEl.className = "analytics-metric__value";
  valueEl.textContent = value;
  card.append(labelEl, valueEl);
  return card;
}

function renderBarChart(container, items, { maxValue = null, unit = "" } = {}) {
  clearElement(container);
  if (!items.length) {
    renderAnalyticsEmpty(container);
    return;
  }

  const width = 420;
  const barHeight = 22;
  const gap = 10;
  const labelWidth = 140;
  const height = items.length * (barHeight + gap) + gap;
  const max =
    maxValue ??
    Math.max(...items.map((item) => (Number.isFinite(item.value) ? item.value : 0)));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");

  items.forEach((item, index) => {
    const y = gap + index * (barHeight + gap);
    const barMaxWidth = width - labelWidth - 24;
    const value = Number.isFinite(item.value) ? item.value : 0;
    const barWidth = max > 0 ? (value / max) * barMaxWidth : 0;

    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", "0");
    label.setAttribute("y", String(y + barHeight - 6));
    label.textContent = item.label;

    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("x", String(labelWidth));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(barWidth));
    rect.setAttribute("height", String(barHeight));
    rect.setAttribute("rx", "6");
    rect.setAttribute("fill", "var(--primary)");

    const valueLabel = document.createElementNS(svg.namespaceURI, "text");
    valueLabel.setAttribute("x", String(labelWidth + barWidth + 8));
    valueLabel.setAttribute("y", String(y + barHeight - 6));
    valueLabel.textContent = `${item.formatted ?? formatNumber(value)}${unit}`;

    svg.append(label, rect, valueLabel);
  });

  container.appendChild(svg);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0";
  }
  const minutes = Math.round(seconds / 60);
  return t("analyticsDurationLabel", {
    minutes: formatNumber(minutes),
  });
}

export function renderAnalytics(analytics) {
  if (!dom.analyticsMetrics || !dom.analyticsErrorChart || !dom.analyticsTimeChart) {
    return;
  }

  clearElement(dom.analyticsMetrics);
  if (dom.analyticsTopErrors) {
    clearElement(dom.analyticsTopErrors);
  }

  if (!analytics || !analytics.attempts_count) {
    dom.analyticsMetrics.appendChild(
      buildMetric(t("analyticsAttempts"), formatNumber(0))
    );
    renderAnalyticsEmpty(dom.analyticsErrorChart);
    renderAnalyticsEmpty(dom.analyticsTimeChart);
    if (dom.analyticsTopErrors) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "analytics-empty";
      emptyItem.textContent = t("analyticsNoData");
      dom.analyticsTopErrors.appendChild(emptyItem);
    }
    return;
  }

  const averagePercent = analytics.average_percent ?? 0;
  const averageAnswered = analytics.average_answered ?? 0;
  const averageDurationSeconds = analytics.average_duration_seconds;

  dom.analyticsMetrics.append(
    buildMetric(t("analyticsAttempts"), formatNumber(analytics.attempts_count)),
    buildMetric(
      t("analyticsAvgScore"),
      `${formatNumber(averagePercent, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    ),
    buildMetric(
      t("analyticsAvgAnswered"),
      formatNumber(averageAnswered, { maximumFractionDigits: 1 })
    ),
    buildMetric(
      t("analyticsAvgTime"),
      averageDurationSeconds ? formatDuration(averageDurationSeconds) : "—"
    )
  );

  const questionStats = analytics.question_stats ?? [];
  const errorRateItems = questionStats.map((entry) => ({
    label: entry.question_label || `#${formatNumber(entry.question_id)}`,
    value: (entry.error_rate ?? 0) * 100,
    formatted: formatNumber((entry.error_rate ?? 0) * 100, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  }));
  renderBarChart(dom.analyticsErrorChart, errorRateItems, { unit: "%" });

  if (dom.analyticsTopErrors) {
    const topErrors = analytics.top_errors ?? [];
    if (!topErrors.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "analytics-empty";
      emptyItem.textContent = t("analyticsNoData");
      dom.analyticsTopErrors.appendChild(emptyItem);
    } else {
      topErrors.forEach((entry) => {
        const item = document.createElement("li");
        const label = entry.question_label || `#${formatNumber(entry.question_id)}`;
        item.textContent = t("analyticsTopErrorItem", {
          label,
          rate: formatNumber((entry.error_rate ?? 0) * 100, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        });
        dom.analyticsTopErrors.appendChild(item);
      });
    }
  }

  const timeDistribution = analytics.time_distribution ?? [];
  const timeLabels = {
    under_2_min: t("analyticsTimeUnder2"),
    "2_to_5_min": t("analyticsTime2to5"),
    "5_to_10_min": t("analyticsTime5to10"),
    over_10_min: t("analyticsTimeOver10"),
  };
  const timeItems = timeDistribution.map((entry) => ({
    label: timeLabels[entry.bucket] || entry.bucket,
    value: entry.count ?? 0,
  }));
  renderBarChart(dom.analyticsTimeChart, timeItems, { maxValue: null });
}
