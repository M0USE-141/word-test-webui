import {
  dom,
  loadLastResult,
  loadProgress,
  saveProgress,
  state,
} from "./state.js";

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
      ? `Переименовать «${state.currentTest.title}»`
      : "Переименовать тест";
  }
  if (dom.editorDeleteTestButton) {
    dom.editorDeleteTestButton.disabled = !hasTest;
    dom.editorDeleteTestButton.textContent = hasTest
      ? `Удалить «${state.currentTest.title}»`
      : "Удалить тест";
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
    img.alt = inline.alt || "";
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
      img.alt = inline.id || "formula";
      img.className = "inline-image";
      parent.appendChild(img);
      return;
    }
    // Формулы без src считаются штатным сценарием (MathML/LaTeX или плейсхолдер).
    parent.appendChild(document.createTextNode("[formula]"));
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
  dom.progressHint.textContent = `Отвечено ранее: ${progress.size} из ${total}.`;
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
    return "Правильный ответ не указан.";
  }
  if (selectedIndex === correctIndex) {
    return "Верно!";
  }
  return `Неверно. Правильный вариант: ${correctIndex + 1}.`;
}

export function renderQuestionNav() {
  clearElement(dom.questionList);
  if (!state.session) {
    return;
  }

  state.session.questions.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${index + 1}`;
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
      state.session.currentIndex = index;
      renderQuestion();
    });

    dom.questionList.appendChild(button);
  });
}

export function renderQuestion() {
  if (!state.session || !state.session.questions.length) {
    dom.questionContainer.textContent = "Нет вопросов для отображения.";
    dom.optionsContainer.textContent = "";
    dom.optionsContainer.classList.add("is-hidden");
    dom.questionProgress.textContent = "Вопрос 0 из 0";
    dom.questionStatus.textContent = "";
    if (dom.answerFeedback) {
      dom.answerFeedback.textContent = "";
    }
    return;
  }

  const entry = state.session.questions[state.session.currentIndex];
  const options = getOptionsForQuestion(entry);
  const selectedIndex = state.session.answers.get(entry.questionId) ?? -1;
  const correctIndex = options.findIndex((option) => option.isCorrect);
  const resolvedCorrectIndex = correctIndex === -1 ? null : correctIndex;

  dom.questionProgress.textContent = `Вопрос ${state.session.currentIndex + 1} из ${
    state.session.questions.length
  }`;
  dom.questionStatus.textContent = `ID вопроса: ${entry.questionId}`;

  renderBlocks(dom.questionContainer, entry.question.question.blocks);

  clearElement(dom.optionsContainer);
  dom.optionsContainer.classList.remove("is-hidden");
  const optionsTitle = document.createElement("h3");
  optionsTitle.textContent = "Варианты ответа";
  dom.optionsContainer.appendChild(optionsTitle);

  const optionsList = document.createElement("div");
  optionsList.className = "options-list";

  options.forEach((option, index) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "option-card";

    const indexBadge = document.createElement("span");
    indexBadge.className = "option-index";
    indexBadge.textContent = `${index + 1}.`;

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
      dom.answerFeedback.textContent =
        "Выберите вариант ответа, чтобы увидеть подсказку.";
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
    dom.resultSummary.textContent = "Ещё нет завершённых попыток.";
    return;
  }
  const { correct, total, answered, percent } = stats;
  dom.resultSummary.textContent = `Результат: ${correct}/${total} правильных, отвечено ${answered}, ${percent.toFixed(
    1
  )}%`;
  const detailItems = [
    `Всего вопросов в попытке: ${total}`,
    `Ответов дано: ${answered}`,
    `Точность: ${percent.toFixed(1)}%`,
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
  newCard.innerHTML = `
    <strong>Новая коллекция</strong>
    <span class="muted">Создайте пустой тест и заполните его вручную.</span>
  `;
  newCard.addEventListener("click", () => {
    onCreateTest();
  });
  dom.testCardsContainer.appendChild(newCard);

  const importCard = document.createElement("button");
  importCard.type = "button";
  importCard.className = "test-card test-card--import";
  importCard.innerHTML = `
    <strong>Импорт теста</strong>
    <span class="muted">Добавьте новую коллекцию из Word-файла. Только .docx.</span>
  `;
  importCard.addEventListener("click", () => {
    onImportTest();
  });
  dom.testCardsContainer.appendChild(importCard);

  if (!tests.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Нет загруженных тестов.";
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
    meta.textContent = `Вопросов: ${test.questionCount}`;

    const stats = document.createElement("div");
    stats.className = "test-card__stats";
    const lastResult = loadLastResult(test.id);
    stats.textContent = lastResult
      ? `Последний результат: ${lastResult.correct}/${lastResult.total} (${lastResult.percent.toFixed(
          1
        )}%)`
      : "Последний результат: нет данных";

    const actions = document.createElement("div");
    actions.className = "test-card__actions";

    const testingButton = document.createElement("button");
    testingButton.type = "button";
    testingButton.textContent = "Тестирование";
    testingButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await onStartTesting(test.id);
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary";
    editButton.textContent = "Редактирование";
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
