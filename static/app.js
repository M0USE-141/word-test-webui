const testSelect = document.getElementById("test-select");
const questionList = document.getElementById("question-list");
const questionContainer = document.getElementById("question-container");
const optionsContainer = document.getElementById("options-container");
const uploadForm = document.getElementById("upload-form");
const uploadFileInput = document.getElementById("upload-file");
const uploadSymbolInput = document.getElementById("upload-symbol");
const uploadLogSmallTablesInput = document.getElementById(
  "upload-log-small-tables"
);
const uploadLogs = document.getElementById("upload-logs");

let currentTest = null;
let currentQuestionIndex = 0;

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

function renderQuestion() {
  if (!currentTest || !currentTest.questions.length) {
    questionContainer.textContent = "Нет вопросов для отображения.";
    optionsContainer.textContent = "";
    return;
  }

  const question = currentTest.questions[currentQuestionIndex];
  renderBlocks(questionContainer, question.question.blocks);

  clearElement(optionsContainer);
  const optionsTitle = document.createElement("h3");
  optionsTitle.textContent = "Варианты ответа";
  optionsContainer.appendChild(optionsTitle);

  question.options.forEach((option) => {
    const optionCard = document.createElement("div");
    optionCard.className = "option";
    renderBlocks(optionCard, option.content.blocks);
    optionsContainer.appendChild(optionCard);
  });
}

function renderQuestionList() {
  clearElement(questionList);
  if (!currentTest) {
    return;
  }
  currentTest.questions.forEach((question, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Вопрос ${index + 1}`;
    button.className = index === currentQuestionIndex ? "active" : "";
    button.addEventListener("click", () => {
      currentQuestionIndex = index;
      renderQuestionList();
      renderQuestion();
    });
    item.appendChild(button);
    questionList.appendChild(item);
  });
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
  currentQuestionIndex = 0;
  renderQuestionList();
  renderQuestion();
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
    const newTestId = uploadResult?.metadata?.id;
    renderTestOptions(tests, newTestId);
    renderUploadLogs(uploadResult?.logs);

    if (newTestId) {
      currentTest = await fetchTest(newTestId);
    } else if (tests.length) {
      currentTest = await fetchTest(tests[0].id);
    }
    currentQuestionIndex = 0;
    renderQuestionList();
    renderQuestion();
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
      renderTestOptions(tests);
      questionContainer.textContent = "Сначала загрузите тест через API.";
      optionsContainer.textContent = "";
      return;
    }

    renderTestOptions(tests, tests[0].id);
    currentTest = await fetchTest(tests[0].id);
    currentQuestionIndex = 0;
    renderQuestionList();
    renderQuestion();
  } catch (error) {
    questionContainer.textContent = error.message;
  }
}

initialize();
