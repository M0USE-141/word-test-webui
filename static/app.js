const testSelect = document.getElementById("test-select");
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

let currentTest = null;
let testsCache = [];
let session = null;

async function fetchTests() {
  const response = await fetch("/api/tests");
  if (!response.ok) {
    throw new Error("Не удалось загрузить список тестов");
  }
  return response.json();
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
    } else if (isSelected) {
      if (!session.settings.showAnswersImmediately) {
        optionButton.classList.add("is-selected");
      } else if (resolvedCorrectIndex === index) {
        optionButton.classList.add("is-correct");
      } else {
        optionButton.classList.add("is-incorrect");
      }
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

function renderTestOptions(tests, selectedId) {
  clearElement(testSelect);
  if (!tests.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Нет загруженных тестов";
    testSelect.appendChild(option);
    return;
  }

  tests.forEach((test) => {
    const option = document.createElement("option");
    option.value = test.id;
    option.textContent = `${test.title} (${test.questionCount})`;
    testSelect.appendChild(option);
  });

  if (selectedId) {
    testSelect.value = selectedId;
  }
}

testSelect.addEventListener("change", async (event) => {
  const testId = event.target.value;
  if (!testId) {
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
    const tests = await fetchTests();
    testsCache = tests;
    const newTestId = uploadResult?.metadata?.id;
    renderTestOptions(tests, newTestId);
    renderUploadLogs(uploadResult?.logs);

    if (newTestId) {
      currentTest = await fetchTest(newTestId);
    } else if (tests.length) {
      currentTest = await fetchTest(tests[0].id);
    }
    session = null;
    updateProgressHint();
    questionContainer.textContent =
      "Нажмите «Начать тестирование», чтобы применить настройки.";
    optionsContainer.textContent = "";
    questionProgress.textContent = "Вопрос 0 из 0";
    renderQuestionNav();
    uploadFileInput.value = "";
  } catch (error) {
    questionContainer.textContent = error.message;
    renderUploadLogs(error.message, true);
  }
});

async function initialize() {
  try {
    const tests = await fetchTests();
    testsCache = tests;
    if (!tests.length) {
      renderTestOptions(tests);
      questionContainer.textContent = "Сначала загрузите тест через API.";
      optionsContainer.textContent = "";
      questionProgress.textContent = "Вопрос 0 из 0";
      return;
    }

    renderTestOptions(tests, tests[0].id);
    currentTest = await fetchTest(tests[0].id);
    session = null;
    updateProgressHint();
    questionContainer.textContent =
      "Нажмите «Начать тестирование», чтобы применить настройки.";
    optionsContainer.textContent = "";
    questionProgress.textContent = "Вопрос 0 из 0";
  } catch (error) {
    questionContainer.textContent = error.message;
  }
}

initialize();
