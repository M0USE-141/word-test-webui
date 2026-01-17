const testCardsContainer = document.getElementById("test-cards");
const questionList = document.getElementById("question-nav");
const questionContainer = document.getElementById("question-container");
const optionsContainer = document.getElementById("options-container");
const uploadForm = document.getElementById("upload-form");
const uploadFileInput = document.getElementById("upload-file");
const uploadDropzone = document.getElementById("upload-dropzone");
const uploadFileName = document.getElementById("upload-file-name");
const uploadFileNameValue = document.querySelector(".upload-file-name__value");
const uploadClearButton = document.getElementById("upload-clear-file");
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
const exitTestButton = document.getElementById("exit-test");
const resultSummary = document.getElementById("result-summary");
const resultDetails = document.getElementById("result-details");
const progressHint = document.getElementById("progress-hint");
const editorModal = document.getElementById("editor-modal");
const closeEditorButton = document.getElementById("close-editor");
const editorRenameTestButton = document.getElementById("editor-rename-test");
const editorDeleteTestButton = document.getElementById("editor-delete-test");
const importModal = document.getElementById("import-modal");
const closeImportButton = document.getElementById("close-import");
const editorQuestionList = document.getElementById("editor-question-list");
const editorForm = document.getElementById("editor-form");
const editorFormTitle = document.getElementById("editor-form-title");
const editorQuestionText = document.getElementById("editor-question-text");
const editorOptionsList = document.getElementById("editor-options-list");
const editorObjectsList = document.getElementById("editor-objects");
const editorAddOption = document.getElementById("add-option");
const editorResetButton = document.getElementById("reset-editor");
const editorStatus = document.getElementById("editor-status");
const editorPanel = document.getElementById("editor-panel");
const editorPanelHome = document.querySelector(".editor-column--form");
const editorObjectType = document.getElementById("editor-object-type");
const editorObjectId = document.getElementById("editor-object-id");
const editorObjectImageFields = document.getElementById(
  "editor-object-image-fields"
);
const editorObjectImageFile = document.getElementById(
  "editor-object-image-file"
);
const editorObjectFormulaFields = document.getElementById(
  "editor-object-formula-fields"
);
const editorObjectFormulaText = document.getElementById(
  "editor-object-formula-text"
);
const editorObjectFormulaFile = document.getElementById(
  "editor-object-formula-file"
);
const editorAddObjectButton = document.getElementById("editor-add-object");
const editorObjectStatus = document.getElementById("editor-object-status");
const editorObjectsToggle = document.getElementById("toggle-editor-objects");
const editorObjectUploadToggle = document.getElementById(
  "toggle-editor-object-upload"
);
const editorObjectUploadSection = document.getElementById(
  "editor-object-upload-section"
);
const editorObjectListSection = document.getElementById(
  "editor-object-list-section"
);
const screenManagement = document.getElementById("screen-management");
const screenTesting = document.getElementById("screen-testing");

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
const INLINE_MARKER_REGEX = /{{\s*(image|formula)\s*:\s*([^}]+)\s*}}/g;

let currentTest = null;
let testsCache = [];
let session = null;

let editorState = {
  mode: "create",
  questionId: null,
  objects: [],
};

const uiState = {
  activeScreen: "management",
};

const editorMobileQuery = window.matchMedia("(max-width: 720px)");
let activeEditorCard = null;
let activeEditorCardKey = null;

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

function renderManagementScreen() {
  if (screenManagement) {
    screenManagement.classList.remove("is-hidden");
    screenManagement.classList.add("is-active");
  }
  if (screenTesting) {
    screenTesting.classList.add("is-hidden");
    screenTesting.classList.remove("is-active");
  }
}

function renderTestingScreen() {
  if (screenTesting) {
    screenTesting.classList.remove("is-hidden");
    screenTesting.classList.add("is-active");
  }
  if (screenManagement) {
    screenManagement.classList.add("is-hidden");
    screenManagement.classList.remove("is-active");
  }
}

function setActiveScreen(screen) {
  if (!screen || screen === uiState.activeScreen) {
    return;
  }
  uiState.activeScreen = screen;
  if (screen === "testing") {
    renderTestingScreen();
  } else {
    renderManagementScreen();
  }
}

function updateEditorTestActions() {
  const hasTest = Boolean(currentTest);
  if (editorRenameTestButton) {
    editorRenameTestButton.disabled = !hasTest;
    editorRenameTestButton.textContent = hasTest
      ? `Переименовать «${currentTest.title}»`
      : "Переименовать тест";
  }
  if (editorDeleteTestButton) {
    editorDeleteTestButton.disabled = !hasTest;
    editorDeleteTestButton.textContent = hasTest
      ? `Удалить «${currentTest.title}»`
      : "Удалить тест";
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

function updateUploadFileState(file) {
  if (!uploadFileName) {
    return;
  }
  if (file) {
    if (uploadFileNameValue) {
      uploadFileNameValue.textContent = file.name;
    } else {
      uploadFileName.textContent = file.name;
    }
    uploadFileName.classList.remove("is-empty");
    uploadDropzone?.classList.remove("is-empty");
    if (uploadClearButton) {
      uploadClearButton.disabled = false;
    }
    return;
  }
  if (uploadFileNameValue) {
    uploadFileNameValue.textContent = "Файл не выбран";
  } else {
    uploadFileName.textContent = "Файл не выбран";
  }
  uploadFileName.classList.add("is-empty");
  uploadDropzone?.classList.add("is-empty");
  if (uploadClearButton) {
    uploadClearButton.disabled = true;
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

function getInlineIdentifier(inline) {
  if (!inline || typeof inline !== "object") {
    return "";
  }
  const candidates =
    inline.type === "image"
      ? [inline.id, inline.src, inline.alt]
      : [inline.id];
  return (
    candidates.find(
      (value) => typeof value === "string" && value.trim().length > 0
    ) || ""
  ).trim();
}

function inlineToMarker(inline) {
  const id = getInlineIdentifier(inline);
  if (!id) {
    return inline.type === "image" ? "[image]" : "[formula]";
  }
  return `{{${inline.type}:${id}}}`;
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
          return inlineToMarker(inline);
        }
        if (inline.type === "formula") {
          return inlineToMarker(inline);
        }
        return "";
      })
      .join("");
  });
  return lines.join("\n").trim();
}

function findEditorQuestion() {
  if (!currentTest || !editorState.questionId) {
    return null;
  }
  return (
    currentTest.questions?.find(
      (question) => question.id === editorState.questionId
    ) || null
  );
}

function createShortLabel(value, fallback) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const base = raw || fallback;
  if (base.length <= 28) {
    return base;
  }
  return `${base.slice(0, 25)}…`;
}

function collectInlineObjects(question) {
  const objects = [];
  if (!question) {
    return objects;
  }
  const addBlocks = (blocks, source) => {
    if (!Array.isArray(blocks)) {
      return;
    }
    blocks.forEach((block) => {
      if (!block || !Array.isArray(block.inlines)) {
        return;
      }
      block.inlines.forEach((inline) => {
        if (!inline || (inline.type !== "image" && inline.type !== "formula")) {
          return;
        }
        objects.push({
          inline,
          inlines: block.inlines,
          source,
        });
      });
    });
  };
  addBlocks(question.question?.blocks, { type: "question" });
  question.options?.forEach((option, index) => {
    addBlocks(option.content?.blocks, {
      type: "option",
      id: option.id ?? index + 1,
    });
  });
  return objects;
}

function collectRegisteredObjects(question) {
  if (!question || !Array.isArray(question.objects)) {
    return [];
  }
  return question.objects.filter(
    (item) => item && typeof item === "object" && item.type
  );
}

function buildInlineRegistry(question) {
  const registry = new Map();
  const objects = collectInlineObjects(question);
  objects.forEach(({ inline }) => {
    const id = getInlineIdentifier(inline);
    if (!id) {
      return;
    }
    const key = `${inline.type}:${id}`;
    if (!registry.has(key)) {
      registry.set(key, inline);
    }
  });
  collectRegisteredObjects(question).forEach((inline) => {
    const id = getInlineIdentifier(inline);
    if (!id) {
      return;
    }
    const key = `${inline.type}:${id}`;
    if (!registry.has(key)) {
      registry.set(key, inline);
    }
  });
  return registry;
}

function getInlineSummary(inline, index) {
  const typeLabel = inline.type === "image" ? "Изображение" : "Формула";
  const hint =
    getInlineIdentifier(inline) || `#${index + 1}`;
  return `${typeLabel}: ${createShortLabel(hint, typeLabel)}`;
}

function buildInlineDetails(inline) {
  const details = document.createElement("div");
  details.className = "object-details";

  if (inline.type === "image") {
    if (inline.src) {
      const img = document.createElement("img");
      img.src = `${currentTest.assetsBaseUrl}/${inline.src}`;
      img.alt = inline.alt || "image";
      img.loading = "lazy";
      img.className = "object-preview-image";
      details.appendChild(img);
    } else {
      const placeholder = document.createElement("p");
      placeholder.className = "muted";
      placeholder.textContent = "Нет ссылки на файл изображения.";
      details.appendChild(placeholder);
    }
  } else if (inline.type === "formula") {
    if (inline.mathml) {
      const math = document.createElement("div");
      math.className = "object-preview-math";
      math.innerHTML = inline.mathml;
      details.appendChild(math);

      const code = document.createElement("pre");
      code.textContent = inline.mathml;
      details.appendChild(code);
    } else if (inline.latex) {
      const math = document.createElement("div");
      math.className = "object-preview-math";
      math.innerHTML = `\\(${inline.latex}\\)`;
      details.appendChild(math);

      const code = document.createElement("pre");
      code.textContent = inline.latex;
      details.appendChild(code);
    } else if (inline.src) {
      const img = document.createElement("img");
      img.src = `${currentTest.assetsBaseUrl}/${inline.src}`;
      img.alt = inline.id || "formula";
      img.className = "object-preview-image";
      details.appendChild(img);
    } else {
      const placeholder = document.createElement("p");
      placeholder.className = "muted";
      placeholder.textContent = "Нет данных формулы.";
      details.appendChild(placeholder);
    }
  }

  return details;
}

function syncEditorFormFromQuestion(question) {
  if (!question) {
    return;
  }
  if (editorQuestionText) {
    editorQuestionText.value = blocksToText(question.question?.blocks || []);
  }
  const options = question.options?.map((option) => ({
    text: blocksToText(option.content?.blocks || []),
    isCorrect: option.isCorrect,
  }));
  renderEditorOptions(options || []);
  syncEditorObjectsFromQuestion(question);
}

function syncEditorObjectsFromQuestion(question) {
  editorState.objects = collectRegisteredObjects(question).map((object) => ({
    ...object,
  }));
}

function getEditorObjects(question) {
  if (editorState.objects && editorState.objects.length) {
    return editorState.objects;
  }
  return collectRegisteredObjects(question);
}

function renderEditorObjects(question = findEditorQuestion()) {
  if (!editorObjectsList) {
    return;
  }
  clearElement(editorObjectsList);
  if (!currentTest || !question) {
    const registered = getEditorObjects(question);
    if (!currentTest) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Выберите вопрос, чтобы увидеть объекты.";
      editorObjectsList.appendChild(empty);
      return;
    }
    if (!registered.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Объекты не найдены.";
      editorObjectsList.appendChild(empty);
      return;
    }
  }

  const inlineObjects = question ? collectInlineObjects(question) : [];
  const registeredObjects = getEditorObjects(question);
  const objects = [
    ...registeredObjects.map((inline) => ({
      inline,
      inlines: null,
      source: { type: "registry" },
    })),
    ...inlineObjects,
  ];
  if (!objects.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Объекты не найдены.";
    editorObjectsList.appendChild(empty);
    return;
  }

  objects.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "object-card";

    const content = document.createElement("div");
    content.className = "object-content";

    const title = document.createElement("div");
    title.className = "object-title";
    title.textContent = getInlineSummary(item.inline, index);

    const source = document.createElement("div");
    source.className = "muted";
    if (item.source.type === "question") {
      source.textContent = "Источник: вопрос";
    } else if (item.source.type === "registry") {
      source.textContent = "Источник: загруженный объект";
    } else {
      source.textContent = `Источник: вариант #${item.source.id}`;
    }
    const controls = document.createElement("div");
    controls.className = "object-controls";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "Удалить";

    const details = buildInlineDetails(item.inline);

    removeButton.addEventListener("click", () => {
      const message =
        item.source.type === "registry"
          ? "Удалить объект из списка доступных?"
          : "Удалить объект из текста вопроса?";
      const confirmed = window.confirm(message);
      if (!confirmed) {
        return;
      }
      if (item.source.type === "registry") {
        editorState.objects = editorState.objects.filter(
          (object) => object !== item.inline
        );
        renderEditorObjects(question);
        return;
      }
      const inlineIndex = item.inlines.indexOf(item.inline);
      if (inlineIndex >= 0) {
        item.inlines.splice(inlineIndex, 1);
      }
      syncEditorFormFromQuestion(question);
      renderEditorObjects(question);
    });

    controls.append(removeButton);
    content.append(title, source, details);
    card.append(content, controls);
    editorObjectsList.appendChild(card);

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([details]);
    }
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
    optionsContainer.classList.add("is-hidden");
    questionProgress.textContent = "Вопрос 0 из 0";
    questionStatus.textContent = "";
    if (answerFeedback) {
      answerFeedback.textContent = "";
    }
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
  optionsContainer.classList.remove("is-hidden");
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
        if (session.settings.showAnswersImmediately && answerFeedback) {
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

  if (answerFeedback) {
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
    optionsContainer.classList.add("is-hidden");
    questionProgress.textContent = "Вопрос 0 из 0";
    return;
  }
  renderQuestion();
}

function renderTestCards(tests, selectedId) {
  clearElement(testCardsContainer);

  const importCard = document.createElement("button");
  importCard.type = "button";
  importCard.className = "test-card test-card--import";
  importCard.innerHTML = `
    <strong>Импорт теста</strong>
    <span class="muted">Добавьте новую коллекцию из Word-файла.</span>
  `;
  importCard.addEventListener("click", () => {
    openImportModal();
  });
  testCardsContainer.appendChild(importCard);

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

    const testingButton = document.createElement("button");
    testingButton.type = "button";
    testingButton.textContent = "Тестирование";
    testingButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await selectTest(test.id);
      setActiveScreen("testing");
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary";
    editButton.textContent = "Редактирование";
    editButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await selectTest(test.id);
      openEditorModal();
      renderEditorQuestionList();
      resetEditorForm();
    });

    actions.append(testingButton, editButton);
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
  updateEditorTestActions();
  editorModal.classList.add("is-open");
  editorModal.setAttribute("aria-hidden", "false");
  renderEditorObjects();
}

function closeEditorModal() {
  if (!editorModal) {
    return;
  }
  editorModal.classList.remove("is-open");
  editorModal.setAttribute("aria-hidden", "true");
}

function openImportModal() {
  if (!importModal) {
    return;
  }
  importModal.classList.add("is-open");
  importModal.setAttribute("aria-hidden", "false");
}

function closeImportModal() {
  if (!importModal) {
    return;
  }
  importModal.classList.remove("is-open");
  importModal.setAttribute("aria-hidden", "true");
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

function ensureEditorPanelInHome() {
  if (!editorPanel || !editorPanelHome) {
    return;
  }
  editorPanelHome.appendChild(editorPanel);
}

function setActiveEditorCard(card, key = null) {
  if (activeEditorCard && activeEditorCard !== card) {
    activeEditorCard.classList.remove("is-expanded");
  }
  activeEditorCard = card;
  if (!card) {
    return;
  }
  const nextKey = key ?? card.dataset.editorCardKey ?? null;
  if (nextKey !== null) {
    activeEditorCardKey = nextKey;
  }
  card.classList.add("is-expanded");
  const expand = card.querySelector(".editor-card-expand");
  if (expand && editorPanel) {
    expand.appendChild(editorPanel);
  }
}

function showEditorPanelInCard(card, key = null) {
  if (!editorPanel) {
    return;
  }
  editorPanel.classList.remove("is-hidden");
  setActiveEditorCard(card, key);
}

function syncEditorPanelLocation() {
  if (!editorPanel) {
    return;
  }
  if (editorMobileQuery.matches) {
    if (activeEditorCard) {
      const expand = activeEditorCard.querySelector(".editor-card-expand");
      if (expand) {
        expand.appendChild(editorPanel);
      }
      editorPanel.classList.remove("is-hidden");
    } else {
      editorPanel.classList.add("is-hidden");
    }
  } else {
    editorPanel.classList.remove("is-hidden");
    ensureEditorPanelInHome();
    if (activeEditorCard) {
      activeEditorCard.classList.remove("is-expanded");
    }
  }
}

function resetEditorForm() {
  if (editorQuestionText) {
    editorQuestionText.value = "";
  }
  renderEditorOptions([]);
  setEditorState("create", null);
  editorState.objects = [];
  setEditorObjectStatus("");
  renderEditorObjects(null);
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

function parseTextToBlocks(text, registry) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  const missing = [];

  const addTextInline = (inlines, value) => {
    if (value) {
      inlines.push({ type: "text", text: value });
    }
  };

  const appendParagraph = (inlines) => {
    if (!inlines.length) {
      inlines.push({ type: "text", text: "" });
    }
    blocks.push({ type: "paragraph", inlines });
  };

  lines.forEach((line) => {
    const inlines = [];
    let lastIndex = 0;
    INLINE_MARKER_REGEX.lastIndex = 0;
    let match;
    while ((match = INLINE_MARKER_REGEX.exec(line))) {
      const [fullMatch, rawType, rawId] = match;
      addTextInline(inlines, line.slice(lastIndex, match.index));
      const type = rawType.trim();
      const id = rawId.trim();
      if (!id) {
        missing.push({ type, id: rawId });
        addTextInline(inlines, fullMatch);
      } else {
        const key = `${type}:${id}`;
        const inline = registry.get(key);
        if (!inline) {
          missing.push({ type, id });
          addTextInline(inlines, fullMatch);
        } else {
          inlines.push({ ...inline });
        }
      }
      lastIndex = match.index + fullMatch.length;
    }
    addTextInline(inlines, line.slice(lastIndex));
    appendParagraph(inlines);
  });

  if (!lines.length) {
    appendParagraph([]);
  }

  return { blocks, missing };
}

function clearEditorValidation() {
  if (editorPanel) {
    editorPanel.querySelectorAll(".is-error").forEach((element) => {
      element.classList.remove("is-error");
    });
    editorPanel.querySelectorAll(".field-error").forEach((element) => {
      element.remove();
    });
  }
}

function setFieldError(container, message) {
  if (!container) {
    return;
  }
  container.classList.add("is-error");
  let messageEl = container.querySelector(".field-error");
  if (!messageEl) {
    messageEl = document.createElement("p");
    messageEl.className = "field-error";
    container.appendChild(messageEl);
  }
  messageEl.textContent = message;
}

function formatMissingMarkers(missing) {
  const unique = new Set(
    missing.map((item) => `${item.type}:${item.id}`)
  );
  return Array.from(unique).join(", ");
}

function collectEditorOptionPayloads(registry) {
  const payloads = [];
  const missingByOption = [];
  let correctBlocks = null;

  editorOptionsList.querySelectorAll(".editor-option").forEach((optionEl) => {
    const textarea = optionEl.querySelector("textarea");
    const checkbox = optionEl.querySelector("input[type='checkbox']");
    const rawText = textarea?.value ?? "";
    if (!rawText.trim()) {
      return;
    }
    const { blocks, missing } = parseTextToBlocks(rawText, registry);
    const isCorrect = checkbox?.checked ?? false;
    if (isCorrect && !correctBlocks) {
      correctBlocks = blocks;
    }
    payloads.push({
      id: payloads.length + 1,
      content: { blocks },
      isCorrect,
    });
    if (missing.length) {
      missingByOption.push({ element: optionEl, missing });
    }
  });

  return { payloads, missingByOption, correctBlocks };
}

function renderEditorQuestionList() {
  clearElement(editorQuestionList);
  activeEditorCard = null;
  const newCard = document.createElement("button");
  newCard.type = "button";
  newCard.className = "editor-card editor-card--new";
  newCard.dataset.editorCardKey = "new";

  const newTitle = document.createElement("div");
  newTitle.className = "editor-card-title";
  newTitle.textContent = "Добавить новый вопрос";

  const newHint = document.createElement("div");
  newHint.className = "muted";
  newHint.textContent = "Раскройте форму добавления вопроса.";

  const newExpand = document.createElement("div");
  newExpand.className = "editor-card-expand";

  newCard.append(newTitle, newHint, newExpand);
  newCard.addEventListener("click", () => {
    resetEditorForm();
    activeEditorCardKey = "new";
    if (editorMobileQuery.matches) {
      showEditorPanelInCard(newCard, "new");
    } else {
      syncEditorPanelLocation();
    }
  });
  editorQuestionList.appendChild(newCard);

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
    const questionId = question.id ?? index + 1;
    card.dataset.editorCardKey = String(questionId);

    const title = document.createElement("div");
    title.className = "editor-card-title";
    title.textContent = `#${questionId}`;

    const preview = document.createElement("div");
    preview.className = "editor-card-preview";
    const blocks = question.question?.blocks;
    if (Array.isArray(blocks) && blocks.length) {
      renderBlocks(preview, blocks);
    } else {
      const text = blocksToText(blocks || [])
        .replace(INLINE_MARKER_REGEX, "")
        .replace(/\s+/g, " ")
        .trim();
      preview.textContent = text || "Без текста";
    }

    const actions = document.createElement("div");
    actions.className = "editor-card-actions";

    const expand = document.createElement("div");
    expand.className = "editor-card-expand";

    const questionKey = String(question.id ?? index + 1);
    const handleSelectQuestion = () => {
      if (
        card === activeEditorCard &&
        activeEditorCardKey === questionKey &&
        editorMobileQuery.matches
      ) {
        return;
      }
      setEditorState("edit", question.id);
      syncEditorFormFromQuestion(question);
      renderEditorObjects(question);
      activeEditorCardKey = questionKey;
      if (editorMobileQuery.matches) {
        showEditorPanelInCard(card, questionKey);
      } else {
        syncEditorPanelLocation();
      }
    };

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

    actions.append(deleteButton);
    card.append(title, preview, actions, expand);
    card.addEventListener("click", handleSelectQuestion);
    editorQuestionList.appendChild(card);
  });

  if (editorMobileQuery.matches && activeEditorCardKey) {
    const targetCard = editorQuestionList.querySelector(
      `[data-editor-card-key="${activeEditorCardKey}"]`
    );
    if (targetCard) {
      showEditorPanelInCard(targetCard, activeEditorCardKey);
    } else {
      activeEditorCardKey = null;
      syncEditorPanelLocation();
    }
  } else {
    syncEditorPanelLocation();
  }
}

function setEditorObjectStatus(message, isError = false) {
  if (!editorObjectStatus) {
    return;
  }
  editorObjectStatus.textContent = message || "";
  editorObjectStatus.classList.toggle("is-error", isError);
}

function updateEditorObjectToggles(showList, showUpload) {
  if (editorObjectsToggle) {
    editorObjectsToggle.textContent = showList
      ? "Скрыть объекты"
      : "Показать объекты";
  }
  if (editorObjectUploadToggle) {
    editorObjectUploadToggle.textContent = showUpload
      ? "Скрыть добавление"
      : "Добавить объект";
  }
}

function setEditorObjectSection(section) {
  if (!editorObjectUploadSection || !editorObjectListSection) {
    return;
  }
  const showUpload = section === "upload";
  const showList = section === "list";
  editorObjectUploadSection.classList.toggle("is-hidden", !showUpload);
  editorObjectListSection.classList.toggle("is-hidden", !showList);
  updateEditorObjectToggles(showList, showUpload);
}

function syncEditorObjectFields() {
  if (!editorObjectType) {
    return;
  }
  const isFormula = editorObjectType.value === "formula";
  editorObjectFormulaFields?.classList.toggle("is-hidden", !isFormula);
  editorObjectImageFields?.classList.toggle("is-hidden", isFormula);
}

async function uploadObjectAsset(testId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/tests/${testId}/assets`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || "Не удалось загрузить объект";
    throw new Error(detail);
  }
  return payload;
}

async function handleAddObject() {
  if (!currentTest) {
    setEditorObjectStatus("Сначала выберите тест.", true);
    return;
  }
  const type = editorObjectType?.value || "image";
  const id = editorObjectId?.value.trim() ?? "";
  if (!id) {
    setEditorObjectStatus("Укажите ID объекта.", true);
    return;
  }
  const existingKey = `${type}:${id}`;
  const registry = buildInlineRegistry(
    findEditorQuestion() ?? { objects: editorState.objects }
  );
  if (registry.has(existingKey)) {
    setEditorObjectStatus("Объект с таким ID уже существует.", true);
    return;
  }

  try {
    if (type === "formula") {
      const xmlText = editorObjectFormulaText?.value.trim() ?? "";
      let formulaText = xmlText;
      const file = editorObjectFormulaFile?.files?.[0];
      if (!formulaText && file) {
        formulaText = (await file.text()).trim();
      }
      if (!formulaText) {
        setEditorObjectStatus("Добавьте XML формулы.", true);
        return;
      }
      editorState.objects.push({
        type: "formula",
        id,
        mathml: formulaText,
      });
      setEditorObjectStatus("Формула добавлена.");
    } else {
      const file = editorObjectImageFile?.files?.[0];
      if (!file) {
        setEditorObjectStatus("Выберите файл изображения.", true);
        return;
      }
      setEditorObjectStatus("Загрузка файла...");
      const asset = await uploadObjectAsset(currentTest.id, file);
      editorState.objects.push({
        type: "image",
        id,
        src: asset.src,
        alt: file.name || id,
      });
      setEditorObjectStatus("Изображение добавлено.");
    }
    if (editorObjectId) {
      editorObjectId.value = "";
    }
    if (editorObjectFormulaText) {
      editorObjectFormulaText.value = "";
    }
    if (editorObjectFormulaFile) {
      editorObjectFormulaFile.value = "";
    }
    if (editorObjectImageFile) {
      editorObjectImageFile.value = "";
    }
    renderEditorObjects(findEditorQuestion());
  } catch (error) {
    setEditorObjectStatus(error.message, true);
  }
}

async function refreshCurrentTest(testId = currentTest?.id) {
  if (!testId) {
    return;
  }
  currentTest = await fetchTest(testId);
  testsCache = await fetchTests();
  renderTestCards(testsCache, currentTest.id);
  session = null;
  updateProgressHint();
  questionContainer.textContent =
    "Нажмите «Начать тестирование», чтобы применить настройки.";
  optionsContainer.textContent = "";
  questionProgress.textContent = "Вопрос 0 из 0";
  renderQuestionNav();
}

async function selectTest(testId) {
  if (!testId) {
    currentTest = null;
    session = null;
    updateProgressHint();
    questionContainer.textContent = "Сначала загрузите тест через API.";
    optionsContainer.textContent = "";
    optionsContainer.classList.add("is-hidden");
    questionProgress.textContent = "Вопрос 0 из 0";
    renderQuestionNav();
    renderResultSummary(null);
    renderTestCards(testsCache, null);
    updateEditorTestActions();
    return;
  }

  const isSameTest = currentTest?.id === testId;
  currentTest = await fetchTest(testId);
  updateProgressHint();
  if (!isSameTest) {
    session = null;
    questionContainer.textContent =
      "Нажмите «Начать тестирование», чтобы применить настройки.";
    optionsContainer.textContent = "";
    optionsContainer.classList.add("is-hidden");
    questionProgress.textContent = "Вопрос 0 из 0";
    renderQuestionNav();
    renderResultSummary(loadLastResult(testId));
  }
  renderTestCards(testsCache, testId);
  updateEditorTestActions();
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

function initializeManagementScreenEvents() {
  updateUploadFileState(uploadFileInput?.files?.[0]);
  editorMobileQuery.addEventListener("change", syncEditorPanelLocation);
  syncEditorObjectFields();
  setEditorObjectSection(null);

  closeEditorButton?.addEventListener("click", () => {
    closeEditorModal();
  });

  closeImportButton?.addEventListener("click", () => {
    closeImportModal();
  });

  importModal?.addEventListener("click", (event) => {
    if (event.target === importModal) {
      closeImportModal();
    }
  });

  editorRenameTestButton?.addEventListener("click", async () => {
    if (!currentTest) {
      return;
    }
    const newTitle = window.prompt(
      "Введите новое название теста:",
      currentTest.title
    );
    if (!newTitle || newTitle.trim() === currentTest.title) {
      return;
    }
    try {
      await renameTest(currentTest.id, newTitle.trim());
      updateEditorTestActions();
    } catch (error) {
      window.alert(error.message);
    }
  });

  editorDeleteTestButton?.addEventListener("click", async () => {
    if (!currentTest) {
      return;
    }
    const confirmed = window.confirm(
      "Удалить тест и все связанные данные?"
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteTest(currentTest.id);
      closeEditorModal();
    } catch (error) {
      window.alert(error.message);
    }
  });

  editorModal?.addEventListener("click", (event) => {
    if (event.target === editorModal) {
      closeEditorModal();
    }
  });

  editorAddOption?.addEventListener("click", () => {
    addOptionRow("", false);
  });

  editorObjectsToggle?.addEventListener("click", () => {
    const isVisible = !editorObjectListSection?.classList.contains("is-hidden");
    setEditorObjectSection(isVisible ? null : "list");
  });

  editorObjectUploadToggle?.addEventListener("click", () => {
    const isVisible = !editorObjectUploadSection?.classList.contains(
      "is-hidden"
    );
    setEditorObjectSection(isVisible ? null : "upload");
  });

  editorResetButton?.addEventListener("click", () => {
    resetEditorForm();
  });

  editorObjectType?.addEventListener("change", () => {
    syncEditorObjectFields();
  });

  editorAddObjectButton?.addEventListener("click", () => {
    handleAddObject();
  });

  editorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentTest) {
      return;
    }
    clearEditorValidation();
    const questionRaw = editorQuestionText.value ?? "";
    if (!questionRaw.trim()) {
      alert("Заполните текст вопроса и хотя бы один вариант ответа.");
      return;
    }
    const inlineRegistry = buildInlineRegistry(
      findEditorQuestion() ?? { objects: editorState.objects }
    );
    const questionParse = parseTextToBlocks(questionRaw, inlineRegistry);
    const questionField = editorQuestionText?.closest(".editor-field");
    if (questionParse.missing.length && questionField) {
      setFieldError(
        questionField,
        `Не найдены объекты: ${formatMissingMarkers(questionParse.missing)}`
      );
    }

    const optionPayloads = collectEditorOptionPayloads(inlineRegistry);
    if (!optionPayloads.payloads.length) {
      alert("Заполните текст вопроса и хотя бы один вариант ответа.");
      return;
    }
    optionPayloads.missingByOption.forEach(({ element, missing }) => {
      setFieldError(
        element,
        `Не найдены объекты: ${formatMissingMarkers(missing)}`
      );
    });

    if (
      questionParse.missing.length ||
      optionPayloads.missingByOption.length
    ) {
      alert("Проверьте идентификаторы объектов в отмеченных полях.");
      return;
    }

    try {
      const payload = {
        question: { blocks: questionParse.blocks },
        options: optionPayloads.payloads,
        objects: editorState.objects,
      };
      if (optionPayloads.correctBlocks) {
        payload.correct = { blocks: optionPayloads.correctBlocks };
      }
      if (editorState.mode === "edit" && editorState.questionId) {
        const editedId = editorState.questionId;
        await updateQuestion(currentTest.id, editedId, payload);
        await refreshCurrentTest(currentTest.id);
        renderEditorQuestionList();
        const updatedQuestion = currentTest?.questions?.find(
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
        await addQuestion(currentTest.id, payload);
        await refreshCurrentTest(currentTest.id);
        renderEditorQuestionList();
        resetEditorForm();
      }
    } catch (error) {
      alert(error.message);
    }
  });

  uploadFileInput?.addEventListener("change", () => {
    updateUploadFileState(uploadFileInput.files?.[0] || null);
  });
  uploadClearButton?.addEventListener("click", () => {
    if (uploadFileInput) {
      uploadFileInput.value = "";
    }
    updateUploadFileState(null);
  });

  uploadForm?.addEventListener("submit", async (event) => {
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
      uploadSymbolInput.value = "";
      uploadLogSmallTablesInput.checked = false;
      updateUploadFileState(null);
      closeImportModal();
    } catch (error) {
      questionContainer.textContent = error.message;
      renderUploadLogs(error.message, true);
    }
  });
}

function initializeTestingScreenEvents() {
  prevQuestionButton?.addEventListener("click", () => {
    if (!session) {
      return;
    }
    session.currentIndex = Math.max(0, session.currentIndex - 1);
    renderQuestion();
  });

  nextQuestionButton?.addEventListener("click", () => {
    if (!session) {
      return;
    }
    session.currentIndex = Math.min(
      session.questions.length - 1,
      session.currentIndex + 1
    );
    renderQuestion();
  });

  finishTestButton?.addEventListener("click", () => {
    finishTest();
  });

  startTestButton?.addEventListener("click", () => {
    startTest();
  });

  exitTestButton?.addEventListener("click", () => {
    setActiveScreen("management");
    optionsContainer.classList.add("is-hidden");
  });
}

async function initialize() {
  initializeManagementScreenEvents();
  initializeTestingScreenEvents();
  renderManagementScreen();

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
