const testCardsContainer = document.getElementById("test-cards");
const questionList = document.getElementById("question-nav");
const questionContainer = document.getElementById("question-container");
const optionsContainer = document.getElementById("options-container");
const uploadForm = document.getElementById("upload-form");
const uploadFileInput = document.getElementById("upload-file");
const uploadSymbolInput = document.getElementById("upload-symbol");
const uploadLogSmallTablesInput = document.getElementById(
  "upload-log-small-tables"
);
const uploadLogs = document.getElementById("upload-logs");
const questionProgress = document.getElementById("question-progress");
const questionStatus = document.getElementById("question-status");
const prevQuestionButton = document.getElementById("prev-question");
const nextQuestionButton = document.getElementById("next-question");
const finishTestButton = document.getElementById("finish-test");
const answerFeedback = document.getElementById("answer-feedback");
const startTestButton = document.getElementById("start-test");
const resultSummary = document.getElementById("result-summary");
const resultDetails = document.getElementById("result-details");
const progressHint = document.getElementById("progress-hint");
const editorModal = document.getElementById("editor-modal");
const openEditorButton = document.getElementById("open-editor");
const closeEditorButton = document.getElementById("close-editor");
const editorQuestionList = document.getElementById("editor-question-list");
const editorForm = document.getElementById("editor-form");
const editorFormTitle = document.getElementById("editor-form-title");
const editorQuestionText = document.getElementById("editor-question-text");
const editorOptionsList = document.getElementById("editor-options-list");
const editorAddOption = document.getElementById("add-option");
const editorResetButton = document.getElementById("reset-editor");
const editorStatus = document.getElementById("editor-status");

const settingQuestionCount = document.getElementById("setting-question-count");
const settingRandomQuestions = document.getElementById(
  "setting-random-questions"
);
const settingRandomOptions = document.getElementById("setting-random-options");
const settingOnlyUnanswered = document.getElementById(
  "setting-only-unanswered"
);
const settingShowAnswers = document.getElementById("setting-show-answers");
const settingMaxOptions = document.getElementById("setting-max-options");

const testsCacheKey = "tests-cache";

const LAST_RESULT_KEY_PREFIX = "test-last-result:";

let currentTest = null;
let testsCache = [];
let session = null;

let editorState = {
  mode: "create",
  questionId: null,
};

function readTestsCache() {
  const raw = localStorage.getItem(testsCacheKey);
  if (!raw) {
    return [];
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function writeTestsCache(tests) {
  testsCache = tests;
  localStorage.setItem(testsCacheKey, JSON.stringify(tests));
}

async function fetchTests({ force = false } = {}) {
  if (!force) {
    if (testsCache.length) {
      return testsCache;
    }
    const cached = readTestsCache();
    if (cached.length) {
      testsCache = cached;
      return cached;
    }
  }

  const response = await fetch("/api/tests");
  if (!response.ok) {
    throw new Error("Не удалось загрузить список тестов");
  }
  const data = await response.json();
  writeTestsCache(data);
  return data;
}

async function fetchTest(testId) {
  const response = await fetch(`/api/tests/${testId}`);
  if (!response.ok) {
    throw new Error("Не удалось загрузить тест");
  }
  return response.json();
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function renderUploadLogs(messages, isError = false) {
  if (!uploadLogs) {
    return;
  }
  clearElement(uploadLogs);
  uploadLogs.classList.toggle("is-error", isError);

  if (!messages) {
    return;
  }

  const logItems = Array.isArray(messages) ? messages : [messages];
  logItems.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    uploadLogs.appendChild(item);
  });
}

function renderInline(parent, inline) {
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
      ? `${currentTest.assetsBaseUrl}/${inline.src}`
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
      img.src = `${currentTest.assetsBaseUrl}/${inline.src}`;
      img.alt = inline.id || "formula";
      img.className = "inline-image";
      parent.appendChild(img);
      return;
    }
    // Формулы без src считаются штатным сценарием (MathML/LaTeX или плейсхолдер).
    parent.appendChild(document.createTextNode("[formula]"));
  }
}

function renderBlocks(container, blocks) {
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

function blocksToText(blocks) {
  if (!Array.isArray(blocks)) {
    return "";
  }
  const lines = blocks.map((block) => {
    if (!block || !Array.isArray(block.inlines)) {
      return "";
    }
    return block.inlines
      .map((inline) => {
        if (inline.type === "text") {
          return inline.text ?? "";
        }
        if (inline.type === "line_break") {
          return "\n";
        }
        if (inline.type === "image") {
          return "[image]";
        }
        if (inline.type === "formula") {
          return "[formula]";
        }
        return "";
      })
      .join("");
  });
  return lines.join("\n").trim();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadProgress(testId) {
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

function loadLastResult(testId) {
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

function saveLastResult(testId, stats) {
  if (!testId || !stats) {
    return;
  }
  localStorage.setItem(
    `${LAST_RESULT_KEY_PREFIX}${testId}`,
    JSON.stringify(stats)
  );
}

function clearLastResult(testId) {
  if (!testId) {
    return;
  }
  localStorage.removeItem(`${LAST_RESULT_KEY_PREFIX}${testId}`);
}

function saveProgress(testId, answeredIds) {
  if (!testId) {
    return;
  }
  const payload = Array.from(answeredIds);
  localStorage.setItem(`test-progress:${testId}`, JSON.stringify(payload));
}

function getSettings() {
  return {
    questionCount: Number.parseInt(settingQuestionCount.value || "0", 10) || 0,
    randomQuestions: settingRandomQuestions.checked,
    randomOptions: settingRandomOptions.checked,
    onlyUnanswered: settingOnlyUnanswered.checked,
    showAnswersImmediately: settingShowAnswers.checked,
    maxOptions: Math.max(1, Number.parseInt(settingMaxOptions.value || "1", 10) || 1),
  };
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
    finished: false,
    settings,
  };
}

function updateProgressHint() {
  if (!currentTest) {
    progressHint.textContent = "";
    return;
  }
  const progress = loadProgress(currentTest.id);
  const total = currentTest.questions.length;
  progressHint.textContent = `Отвечено ранее: ${progress.size} из ${total}.`;
}

function renderQuestionNav() {
  clearElement(questionList);
  if (!session) {
    return;
  }

  session.questions.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${index + 1}`;
    button.className = "nav-button";

    const status = session.answerStatus.get(entry.questionId);
    if (session.finished) {
      if (status === "correct") {
        button.classList.add("is-correct");
      } else if (status === "incorrect") {
        button.classList.add("is-incorrect");
      }
    } else if (session.settings.showAnswersImmediately) {
      if (status === "correct") {
        button.classList.add("is-correct");
      } else if (status === "incorrect") {
        button.classList.add("is-incorrect");
      }
    } else {
      button.classList.add("is-neutral");
    }

    if (index === session.currentIndex) {
      button.classList.add("is-current");
    }

    button.addEventListener("click", () => {
      session.currentIndex = index;
      renderQuestion();
    });

    questionList.appendChild(button);
  });
}

function getOptionsForQuestion(entry) {
  const cached = session.optionOrders.get(entry.questionId);
  if (cached) {
    return cached;
  }
  let options = [...entry.question.options];
  if (session.settings.randomOptions) {
    options = shuffle(options);
  }
  options = options.slice(0, session.settings.maxOptions);
  session.optionOrders.set(entry.questionId, options);
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

function renderQuestion() {
  if (!session || !session.questions.length) {
    questionContainer.textContent = "Нет вопросов для отображения.";
    optionsContainer.textContent = "";
    questionProgress.textContent = "Вопрос 0 из 0";
    questionStatus.textContent = "";
    answerFeedback.textContent = "";
    return;
  }

  const entry = session.questions[session.currentIndex];
  const options = getOptionsForQuestion(entry);
  const selectedIndex = session.answers.get(entry.questionId) ?? -1;
  const correctIndex = options.findIndex((option) => option.isCorrect);
  const resolvedCorrectIndex = correctIndex === -1 ? null : correctIndex;

  questionProgress.textContent = `Вопрос ${session.currentIndex + 1} из ${
    session.questions.length
  }`;
  questionStatus.textContent = `ID вопроса: ${entry.questionId}`;

  renderBlocks(questionContainer, entry.question.question.blocks);

  clearElement(optionsContainer);
  const optionsTitle = document.createElement("h3");
  optionsTitle.textContent = "Варианты ответа";
  optionsContainer.appendChild(optionsTitle);

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
    if (session.finished) {
      if (resolvedCorrectIndex === index) {
        optionButton.classList.add("is-correct");
      } else if (isSelected) {
        optionButton.classList.add("is-incorrect");
      }
      optionButton.disabled = true;
    } else if (session.settings.showAnswersImmediately && selectedIndex !== -1) {
      if (resolvedCorrectIndex === index) {
        optionButton.classList.add("is-correct");
      }
      if (isSelected && resolvedCorrectIndex !== index) {
        optionButton.classList.add("is-incorrect");
      }
    } else if (isSelected) {
      optionButton.classList.add("is-selected");
    }

    if (!session.finished) {
      optionButton.addEventListener("click", () => {
        session.answers.set(entry.questionId, index);
        if (resolvedCorrectIndex === null) {
          session.answerStatus.set(entry.questionId, "unanswered");
        } else if (index === resolvedCorrectIndex) {
          session.answerStatus.set(entry.questionId, "correct");
        } else {
          session.answerStatus.set(entry.questionId, "incorrect");
        }
        const progress = loadProgress(session.testId);
        progress.add(entry.questionId);
        saveProgress(session.testId, progress);
        updateProgressHint();
        if (session.settings.showAnswersImmediately) {
          answerFeedback.textContent = getAnswerFeedback(
            index,
            resolvedCorrectIndex
          );
        }
        renderQuestion();
      });
    }

    optionsList.appendChild(optionButton);
  });

  optionsContainer.appendChild(optionsList);

  if (!session.settings.showAnswersImmediately || session.finished) {
    answerFeedback.textContent = "";
  } else if (selectedIndex !== -1) {
    answerFeedback.textContent = getAnswerFeedback(
      selectedIndex,
      resolvedCorrectIndex
    );
  } else {
    answerFeedback.textContent =
      "Выберите вариант ответа, чтобы увидеть подсказку.";
  }

  prevQuestionButton.disabled = session.currentIndex === 0;
  nextQuestionButton.disabled =
    session.currentIndex >= session.questions.length - 1;

  renderQuestionNav();
}

function renderResultSummary(stats) {
  clearElement(resultDetails);
  if (!stats) {
    resultSummary.textContent = "Ещё нет завершённых попыток.";
    return;
  }
  const { correct, total, answered, percent } = stats;
  resultSummary.textContent = `Результат: ${correct}/${total} правильных, отвечено ${answered}, ${percent.toFixed(
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
    resultDetails.appendChild(item);
  });
}

function finishTest() {
  if (!session || session.finished) {
    return;
  }
  session.finished = true;

  let correct = 0;
  let answered = 0;
  session.questions.forEach((entry) => {
    const selected = session.answers.get(entry.questionId);
    if (selected === undefined || selected === -1) {
      return;
    }
    answered += 1;
    const options = getOptionsForQuestion(entry);
    if (options[selected]?.isCorrect) {
      correct += 1;
    }
  });
  const total = session.questions.length;
  const percent = total ? (correct / total) * 100 : 0;

  saveLastResult(session.testId, {
    correct,
    total,
    answered,
    percent,
    completedAt: new Date().toISOString(),
  });
  renderTestCards(testsCache, session.testId);
  renderResultSummary({ correct, total, answered, percent });
  renderQuestion();
}

function startTest() {
  if (!currentTest) {
    questionContainer.textContent = "Сначала выберите тест.";
    return;
  }
  const settings = getSettings();
  session = buildSession(currentTest, settings);
  renderResultSummary(null);
  if (!session.questions.length) {
    questionContainer.textContent = "Нет вопросов для тестирования.";
    optionsContainer.textContent = "";
    questionProgress.textContent = "Вопрос 0 из 0";
    return;
  }
  renderQuestion();
}

function renderTestCards(tests, selectedId) {
  clearElement(testCardsContainer);
  if (!tests.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Нет загруженных тестов.";
    testCardsContainer.appendChild(empty);
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

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "secondary";
    renameButton.textContent = "Переименовать";
    renameButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const newTitle = window.prompt(
        "Введите новое название теста:",
        test.title
      );
      if (!newTitle || newTitle.trim() === test.title) {
        return;
      }
      try {
        await renameTest(test.id, newTitle.trim());
      } catch (error) {
        window.alert(error.message);
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = window.confirm(
        "Удалить тест и все связанные данные?"
      );
      if (!confirmed) {
        return;
      }
      try {
        await deleteTest(test.id);
      } catch (error) {
        window.alert(error.message);
      }
    });

    actions.append(renameButton, deleteButton);
    card.append(title, meta, stats, actions);
    card.addEventListener("click", async () => {
      await selectTest(test.id);
    });

    testCardsContainer.appendChild(card);
  });
}

function openEditorModal() {
  if (!editorModal) {
    return;
  }
  editorModal.classList.add("is-open");
  editorModal.setAttribute("aria-hidden", "false");
}

function closeEditorModal() {
  if (!editorModal) {
    return;
  }
  editorModal.classList.remove("is-open");
  editorModal.setAttribute("aria-hidden", "true");
}

function renderEditorOptions(options = []) {
  clearElement(editorOptionsList);
  if (!options.length) {
    addOptionRow("", false);
    return;
  }
  options.forEach((option) => {
    addOptionRow(option.text || "", Boolean(option.isCorrect));
  });
}

function setEditorState(mode, questionId = null) {
  editorState = { mode, questionId };
  if (editorFormTitle) {
    editorFormTitle.textContent =
      mode === "edit" ? `Редактирование вопроса #${questionId}` : "Новый вопрос";
  }
  if (editorStatus) {
    editorStatus.textContent =
      mode === "edit"
        ? "Обновите текст и варианты ответов, затем сохраните."
        : "Создайте новый вопрос и добавьте варианты ответов.";
  }
}

function resetEditorForm() {
  if (!editorQuestionText) {
    return;
  }
  editorQuestionText.value = "";
  renderEditorOptions([]);
  setEditorState("create", null);
}

function addOptionRow(value = "", isCorrect = false) {
  const wrapper = document.createElement("div");
  wrapper.className = "editor-option";

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.placeholder = "Текст варианта ответа";

  const controls = document.createElement("div");
  controls.className = "editor-option-controls";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "checkbox-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isCorrect;
  const checkboxText = document.createElement("span");
  checkboxText.textContent = "Правильный вариант";
  checkboxLabel.append(checkbox, checkboxText);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ghost";
  removeButton.textContent = "Удалить";
  removeButton.addEventListener("click", () => {
    wrapper.remove();
    if (!editorOptionsList.children.length) {
      addOptionRow("", false);
    }
  });

  controls.append(checkboxLabel, removeButton);
  wrapper.append(textarea, controls);
  editorOptionsList.appendChild(wrapper);
}

function collectEditorOptions() {
  const options = [];
  editorOptionsList.querySelectorAll(".editor-option").forEach((optionEl) => {
    const textarea = optionEl.querySelector("textarea");
    const checkbox = optionEl.querySelector("input[type='checkbox']");
    options.push({
      text: textarea?.value.trim() ?? "",
      isCorrect: checkbox?.checked ?? false,
    });
  });
  return options.filter((option) => option.text);
}

function renderEditorQuestionList() {
  clearElement(editorQuestionList);
  if (!currentTest || !currentTest.questions?.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Вопросы не найдены. Добавьте новый.";
    editorQuestionList.appendChild(empty);
    return;
  }

  currentTest.questions.forEach((question, index) => {
    const card = document.createElement("div");
    card.className = "editor-card";

    const title = document.createElement("div");
    title.className = "editor-card-title";
    const text = blocksToText(question.question?.blocks || []);
    title.textContent = `#${question.id ?? index + 1}: ${
      text || "Без текста"
    }`;

    const actions = document.createElement("div");
    actions.className = "editor-card-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "ghost";
    editButton.textContent = "Редактировать";
    editButton.addEventListener("click", () => {
      setEditorState("edit", question.id);
      editorQuestionText.value = text;
      const options = question.options?.map((option) => ({
        text: blocksToText(option.content?.blocks || []),
        isCorrect: option.isCorrect,
      }));
      renderEditorOptions(options || []);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", async () => {
      if (!currentTest) {
        return;
      }
      const confirmed = window.confirm(
        `Удалить вопрос #${question.id ?? index + 1}?`
      );
      if (!confirmed) {
        return;
      }
      await deleteQuestion(currentTest.id, question.id);
    });

    actions.append(editButton, deleteButton);
    card.append(title, actions);
    editorQuestionList.appendChild(card);
  });
}

async function refreshCurrentTest(testId = currentTest?.id) {
  if (!testId) {
    return;
  }
  currentTest = await fetchTest(testId);
  testsCache = await fetchTests();
  renderTestOptions(testsCache, currentTest.id);
  session = null;
  updateProgressHint();
  questionContainer.textContent =
    "Нажмите «Начать тестирование», чтобы применить настройки.";
  optionsContainer.textContent = "";
  questionProgress.textContent = "Вопрос 0 из 0";
  renderQuestionNav();
}

async function updateQuestion(testId, questionId, payload) {
  const response = await fetch(
    `/api/tests/${testId}/questions/${questionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Не удалось обновить вопрос");
  }
  return response.json();
}

async function addQuestion(testId, payload) {
  const response = await fetch(`/api/tests/${testId}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Не удалось добавить вопрос");
  }
  return response.json();
}

async function deleteQuestion(testId, questionId) {
  const response = await fetch(
    `/api/tests/${testId}/questions/${questionId}`,
    {
      method: "DELETE",
    }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Не удалось удалить вопрос");
  }
  await refreshCurrentTest(testId);
  renderEditorQuestionList();
  resetEditorForm();
}

testSelect.addEventListener("change", async (event) => {
  const testId = event.target.value;
  
  if (!testId) {
    currentTest = null;
    session = null;
    updateProgressHint();
    questionContainer.textContent = "Сначала загрузите тест через API.";
    optionsContainer.textContent = "";
    questionProgress.textContent = "Вопрос 0 из 0";
    renderQuestionNav();
    renderResultSummary(null);
    return;
  }
  currentTest = await fetchTest(testId);
  session = null;
  updateProgressHint();
  questionContainer.textContent =
    "Нажмите «Начать тестирование», чтобы применить настройки.";
  optionsContainer.textContent = "";
  questionProgress.textContent = "Вопрос 0 из 0";
  renderQuestionNav();
  renderResultSummary(null);
  renderTestCards(testsCache, testId);
}

async function renameTest(testId, title) {
  const response = await fetch(`/api/tests/${testId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || "Не удалось переименовать тест";
    throw new Error(detail);
  }
  const tests = await fetchTests();
  testsCache = tests;
  renderTestCards(tests, testId);
  if (currentTest?.id === testId) {
    currentTest = await fetchTest(testId);
    updateProgressHint();
  }
}

async function deleteTest(testId) {
  const response = await fetch(`/api/tests/${testId}`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || "Не удалось удалить тест";
    throw new Error(detail);
  }
  localStorage.removeItem(`test-progress:${testId}`);
  clearLastResult(testId);

  const tests = await fetchTests();
  testsCache = tests;
  const nextId = tests[0]?.id || null;
  renderTestCards(tests, nextId);
  await selectTest(nextId);
}

openEditorButton?.addEventListener("click", () => {
  if (!currentTest) {
    return;
  }
  openEditorModal();
  renderEditorQuestionList();
  resetEditorForm();
});

closeEditorButton?.addEventListener("click", () => {
  closeEditorModal();
});

editorModal?.addEventListener("click", (event) => {
  if (event.target === editorModal) {
    closeEditorModal();
  }
});

editorAddOption?.addEventListener("click", () => {
  addOptionRow("", false);
});

editorResetButton?.addEventListener("click", () => {
  resetEditorForm();
});

editorForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTest) {
    return;
  }
  const questionText = editorQuestionText.value.trim();
  const options = collectEditorOptions();
  if (!questionText || !options.length) {
    alert("Заполните текст вопроса и хотя бы один вариант ответа.");
    return;
  }
  try {
    if (editorState.mode === "edit" && editorState.questionId) {
      await updateQuestion(currentTest.id, editorState.questionId, {
        questionText,
        options,
      });
    } else {
      await addQuestion(currentTest.id, { questionText, options });
    }
    await refreshCurrentTest(currentTest.id);
    renderEditorQuestionList();
    resetEditorForm();
  } catch (error) {
    alert(error.message);
  }
});

prevQuestionButton.addEventListener("click", () => {
  if (!session) {
    return;
  }
  session.currentIndex = Math.max(0, session.currentIndex - 1);
  renderQuestion();
});

nextQuestionButton.addEventListener("click", () => {
  if (!session) {
    return;
  }
  session.currentIndex = Math.min(
    session.questions.length - 1,
    session.currentIndex + 1
  );
  renderQuestion();
});

finishTestButton.addEventListener("click", () => {
  finishTest();
});

startTestButton.addEventListener("click", () => {
  startTest();
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!uploadFileInput.files?.length) {
    questionContainer.textContent = "Сначала выберите файл для импорта.";
    renderUploadLogs("Сначала выберите файл для импорта.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", uploadFileInput.files[0]);
  formData.append("symbol", uploadSymbolInput.value.trim());
  formData.append(
    "log_small_tables",
    uploadLogSmallTablesInput.checked ? "true" : "false"
  );

  try {
    const response = await fetch("/api/tests/upload", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail || "Не удалось импортировать тест";
      throw new Error(detail);
    }
    const uploadResult = payload ?? {};
    const tests = await fetchTests({ force: true });
    const newTestId = uploadResult?.metadata?.id;
    renderUploadLogs(uploadResult?.logs);

    const nextTestId = newTestId || tests[0]?.id;
    renderTestCards(tests, nextTestId);
    await selectTest(nextTestId);
    uploadFileInput.value = "";
  } catch (error) {
    questionContainer.textContent = error.message;
    renderUploadLogs(error.message, true);
  }
});

async function initialize() {
  try {
    const tests = await fetchTests();
    if (!tests.length) {
      renderTestCards(tests);
      await selectTest(null);
      return;
    }

    renderTestCards(tests, tests[0].id);
    await selectTest(tests[0].id);
  } catch (error) {
    questionContainer.textContent = error.message;
  }
}

initialize();
