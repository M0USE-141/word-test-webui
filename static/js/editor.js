import { uploadObjectAsset } from "./api.js";
import {
  dom,
  editorMobileQuery,
  INLINE_MARKER_REGEX,
  state,
  SUPPORTED_IMAGE_EXTENSIONS,
} from "./state.js";
import { clearElement, renderBlocks } from "./rendering.js";
import { formatNumber, t } from "./i18n.js";

export function getInlineIdentifier(inline) {
  if (!inline || typeof inline !== "object") {
    return "";
  }
  const candidates =
    inline.type === "image"
      ? [inline.id, inline.src, inline.alt]
      : [inline.id, inline.src];
  return (
    candidates.find(
      (value) => typeof value === "string" && value.trim().length > 0
    ) || ""
  ).trim();
}

export function isLegacyDocFile(fileName) {
  if (!fileName) {
    return false;
  }
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith(".doc") && !lowerName.endsWith(".docx");
}

export function isSupportedImageFile(file) {
  if (!file?.name) {
    return false;
  }
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export function isXmlFile(file) {
  if (!file?.name) {
    return false;
  }
  return file.name.toLowerCase().endsWith(".xml");
}

function generateShortFormulaId(usedIds) {
  let id = "";
  do {
    id = Math.random().toString(36).slice(2, 8);
  } while (!id || usedIds.has(id));
  usedIds.add(id);
  return id;
}

function collectFormulaIdsFromBlocks(blocks, usedIds) {
  if (!Array.isArray(blocks)) {
    return;
  }
  blocks.forEach((block) => {
    if (!block || !Array.isArray(block.inlines)) {
      return;
    }
    block.inlines.forEach((inline) => {
      if (!inline || inline.type !== "formula") {
        return;
      }
      const id = typeof inline.id === "string" ? inline.id.trim() : "";
      if (id) {
        usedIds.add(id);
      }
    });
  });
}

function ensureFormulaIdsForQuestion(question) {
  if (!question) {
    return;
  }
  const usedIds = new Set();
  collectFormulaIdsFromBlocks(question.question?.blocks, usedIds);
  question.options?.forEach((option) => {
    collectFormulaIdsFromBlocks(option.content?.blocks, usedIds);
  });
  question.objects?.forEach((inline) => {
    if (!inline || inline.type !== "formula") {
      return;
    }
    const id = typeof inline.id === "string" ? inline.id.trim() : "";
    if (id) {
      usedIds.add(id);
    }
  });

  const assignId = (inline) => {
    if (!inline || inline.type !== "formula") {
      return;
    }
    const trimmedId = typeof inline.id === "string" ? inline.id.trim() : "";
    if (trimmedId) {
      inline.id = trimmedId;
      usedIds.add(trimmedId);
      return;
    }
    inline.id = generateShortFormulaId(usedIds);
  };

  const assignInBlocks = (blocks) => {
    if (!Array.isArray(blocks)) {
      return;
    }
    blocks.forEach((block) => {
      if (!block || !Array.isArray(block.inlines)) {
        return;
      }
      block.inlines.forEach((inline) => {
        assignId(inline);
      });
    });
  };

  assignInBlocks(question.question?.blocks);
  question.options?.forEach((option) => {
    assignInBlocks(option.content?.blocks);
  });
  question.objects?.forEach((inline) => {
    assignId(inline);
  });
}

function inlineToMarker(inline) {
  const id = getInlineIdentifier(inline);
  if (!id) {
    return inline.type === "image"
      ? t("inlineImagePlaceholder")
      : t("inlineFormulaPlaceholder");
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

export function findEditorQuestion() {
  if (!state.currentTest || !state.editorState.questionId) {
    return null;
  }
  return (
    state.currentTest.questions?.find(
      (question) => question.id === state.editorState.questionId
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

export function buildInlineRegistry(question) {
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
  const typeLabel =
    inline.type === "image" ? t("inlineTypeImage") : t("inlineTypeFormula");
  if (inline.type === "formula") {
    const id = getInlineIdentifier(inline);
    return t("inlineFormulaSummary", {
      label: createShortLabel(id, typeLabel),
    });
  }
  const hint = getInlineIdentifier(inline) || `#${formatNumber(index + 1)}`;
  return t("inlineImageSummary", {
    label: createShortLabel(hint, typeLabel),
  });
}

function buildInlineDetails(inline) {
  const details = document.createElement("div");
  details.className = "object-details";

  if (inline.type === "image") {
    if (inline.src) {
      const img = document.createElement("img");
      img.src = `${state.currentTest.assetsBaseUrl}/${inline.src}`;
      img.alt = inline.alt || t("inlineImageAlt");
      img.loading = "lazy";
      img.className = "object-preview-image";
      details.appendChild(img);
    } else {
      const placeholder = document.createElement("p");
      placeholder.className = "muted";
      placeholder.textContent = t("noImageLink");
      details.appendChild(placeholder);
    }
  } else if (inline.type === "formula") {
    if (inline.mathml) {
      const math = document.createElement("div");
      math.className = "object-preview-math";
      math.innerHTML = inline.mathml;
      details.appendChild(math);

      const codeDetails = document.createElement("details");
      const codeSummary = document.createElement("summary");
      codeSummary.textContent = t("showMathML");
      const code = document.createElement("pre");
      code.textContent = inline.mathml;
      codeDetails.appendChild(codeSummary);
      codeDetails.appendChild(code);
      details.appendChild(codeDetails);
    } else if (inline.latex) {
      const math = document.createElement("div");
      math.className = "object-preview-math";
      math.innerHTML = `\\(${inline.latex}\\)`;
      details.appendChild(math);

      const codeDetails = document.createElement("details");
      const codeSummary = document.createElement("summary");
      codeSummary.textContent = t("showLatex");
      const code = document.createElement("pre");
      code.textContent = inline.latex;
      codeDetails.appendChild(codeSummary);
      codeDetails.appendChild(code);
      details.appendChild(codeDetails);
    } else if (inline.src) {
      const img = document.createElement("img");
      img.src = `${state.currentTest.assetsBaseUrl}/${inline.src}`;
      img.alt = inline.id || t("inlineFormulaAlt");
      img.className = "object-preview-image";
      details.appendChild(img);
    } else {
      const placeholder = document.createElement("p");
      placeholder.className = "muted";
      placeholder.textContent = t("noFormulaData");
      details.appendChild(placeholder);
    }
  }

  return details;
}

export function syncEditorFormFromQuestion(question) {
  if (!question) {
    return;
  }
  ensureFormulaIdsForQuestion(question);
  if (dom.editorQuestionText) {
    dom.editorQuestionText.value = blocksToText(question.question?.blocks || []);
  }
  const options = question.options?.map((option) => ({
    text: blocksToText(option.content?.blocks || []),
    isCorrect: option.isCorrect,
  }));
  renderEditorOptions(options || []);
  syncEditorObjectsFromQuestion(question);
}

function syncEditorObjectsFromQuestion(question) {
  state.editorState.objects = collectRegisteredObjects(question).map(
    (object) => ({
      ...object,
    })
  );
}

function getEditorObjects(question) {
  if (state.editorState.objects && state.editorState.objects.length) {
    return state.editorState.objects;
  }
  return collectRegisteredObjects(question);
}

export function renderEditorObjects(question = findEditorQuestion()) {
  if (!dom.editorObjectsList) {
    return;
  }
  clearElement(dom.editorObjectsList);
  if (!state.currentTest || !question) {
    const registered = getEditorObjects(question);
    if (!state.currentTest) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = t("editorObjectSelectQuestion");
      dom.editorObjectsList.appendChild(empty);
      return;
    }
    if (!registered.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = t("editorObjectListEmpty");
      dom.editorObjectsList.appendChild(empty);
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
    empty.textContent = t("editorObjectListEmpty");
    dom.editorObjectsList.appendChild(empty);
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
      source.textContent = t("editorObjectSourceQuestion");
    } else if (item.source.type === "registry") {
      source.textContent = t("editorObjectSourceRegistry");
    } else {
      source.textContent = t("editorObjectSourceOption", {
        id: formatNumber(item.source.id),
      });
    }
    const controls = document.createElement("div");
    controls.className = "object-controls";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = t("commonDelete");

    const details = buildInlineDetails(item.inline);

    removeButton.addEventListener("click", () => {
      const message =
        item.source.type === "registry"
          ? t("confirmDeleteObjectRegistry")
          : t("confirmDeleteObjectInline");
      const confirmed = window.confirm(message);
      if (!confirmed) {
        return;
      }
      if (item.source.type === "registry") {
        state.editorState.objects = state.editorState.objects.filter(
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
    dom.editorObjectsList.appendChild(card);

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([details]);
    }
  });
}

export function renderEditorOptions(options = []) {
  clearElement(dom.editorOptionsList);
  if (!options.length) {
    addOptionRow("", false);
    return;
  }
  options.forEach((option) => {
    addOptionRow(option.text || "", Boolean(option.isCorrect));
  });
}

export function setEditorState(mode, questionId = null) {
  state.editorState = { mode, questionId, objects: state.editorState.objects };
  if (dom.editorFormTitle) {
    dom.editorFormTitle.textContent =
      mode === "edit"
        ? t("editorFormTitleEdit", { id: formatNumber(questionId) })
        : t("editorFormTitleNew");
  }
  if (dom.editorStatus) {
    dom.editorStatus.textContent =
      mode === "edit"
        ? t("editorStatusEdit")
        : t("editorStatusCreate");
  }
}

function ensureEditorPanelInHome() {
  if (!dom.editorPanel || !dom.editorPanelHome) {
    return;
  }
  dom.editorPanelHome.appendChild(dom.editorPanel);
}

function setActiveEditorCard(card, key = null) {
  if (state.activeEditorCard && state.activeEditorCard !== card) {
    state.activeEditorCard.classList.remove("is-expanded");
  }
  state.activeEditorCard = card;
  if (!card) {
    return;
  }
  const nextKey = key ?? card.dataset.editorCardKey ?? null;
  if (nextKey !== null) {
    state.activeEditorCardKey = nextKey;
  }
  card.classList.add("is-expanded");
  const expand = card.querySelector(".editor-card-expand");
  if (expand && dom.editorPanel) {
    expand.appendChild(dom.editorPanel);
  }
}

function showEditorPanelInCard(card, key = null) {
  if (!dom.editorPanel) {
    return;
  }
  dom.editorPanel.classList.remove("is-hidden");
  setActiveEditorCard(card, key);
}

export function syncEditorPanelLocation() {
  if (!dom.editorPanel) {
    return;
  }
  if (editorMobileQuery.matches) {
    if (state.activeEditorCard) {
      const expand = state.activeEditorCard.querySelector(
        ".editor-card-expand"
      );
      if (expand) {
        expand.appendChild(dom.editorPanel);
      }
      dom.editorPanel.classList.remove("is-hidden");
    } else {
      dom.editorPanel.classList.add("is-hidden");
    }
  } else {
    dom.editorPanel.classList.remove("is-hidden");
    ensureEditorPanelInHome();
    if (state.activeEditorCard) {
      state.activeEditorCard.classList.remove("is-expanded");
    }
  }
}

export function resetEditorForm() {
  if (dom.editorQuestionText) {
    dom.editorQuestionText.value = "";
  }
  renderEditorOptions([]);
  setEditorState("create", null);
  state.editorState.objects = [];
  setEditorObjectStatus("");
  renderEditorObjects(null);
}

export function addOptionRow(value = "", isCorrect = false) {
  const wrapper = document.createElement("div");
  wrapper.className = "editor-option";

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.placeholder = t("editorOptionPlaceholder");
  textarea.dataset.i18nPlaceholder = "editorOptionPlaceholder";

  const controls = document.createElement("div");
  controls.className = "editor-option-controls";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "checkbox-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isCorrect;
  const checkboxText = document.createElement("span");
  checkboxText.textContent = t("editorOptionCorrect");
  checkboxText.dataset.i18n = "editorOptionCorrect";
  checkboxLabel.append(checkbox, checkboxText);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ghost";
  removeButton.textContent = t("commonDelete");
  removeButton.dataset.i18n = "commonDelete";
  removeButton.addEventListener("click", () => {
    wrapper.remove();
    if (!dom.editorOptionsList.children.length) {
      addOptionRow("", false);
    }
  });

  controls.append(checkboxLabel, removeButton);
  wrapper.append(textarea, controls);
  dom.editorOptionsList.appendChild(wrapper);
}

export function parseTextToBlocks(text, registry) {
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

export function clearEditorValidation() {
  if (dom.editorPanel) {
    dom.editorPanel.querySelectorAll(".is-error").forEach((element) => {
      element.classList.remove("is-error");
    });
    dom.editorPanel.querySelectorAll(".field-error").forEach((element) => {
      element.remove();
    });
  }
}

export function setFieldError(container, message) {
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

export function formatMissingMarkers(missing) {
  const unique = new Set(missing.map((item) => `${item.type}:${item.id}`));
  return Array.from(unique).join(", ");
}

export function collectEditorOptionPayloads(registry) {
  const payloads = [];
  const missingByOption = [];
  let correctBlocks = null;

  dom.editorOptionsList.querySelectorAll(".editor-option").forEach((optionEl) => {
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

export function renderEditorQuestionList({ onDeleteQuestion } = {}) {
  clearElement(dom.editorQuestionList);
  state.activeEditorCard = null;
  const newCard = document.createElement("button");
  newCard.type = "button";
  newCard.className = "editor-card editor-card--new";
  newCard.dataset.editorCardKey = "new";

  const newTitle = document.createElement("div");
  newTitle.className = "editor-card-title";
  newTitle.textContent = t("editorQuestionAddTitle");

  const newHint = document.createElement("div");
  newHint.className = "muted";
  newHint.textContent = t("editorQuestionAddHint");

  const newExpand = document.createElement("div");
  newExpand.className = "editor-card-expand";

  newCard.append(newTitle, newHint, newExpand);
  newCard.addEventListener("click", () => {
    resetEditorForm();
    state.activeEditorCardKey = "new";
    if (editorMobileQuery.matches) {
      showEditorPanelInCard(newCard, "new");
    } else {
      syncEditorPanelLocation();
    }
  });
  dom.editorQuestionList.appendChild(newCard);

  if (!state.currentTest || !state.currentTest.questions?.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = t("editorQuestionListEmpty");
    dom.editorQuestionList.appendChild(empty);
    return;
  }

  state.currentTest.questions.forEach((question, index) => {
    const card = document.createElement("div");
    card.className = "editor-card";
    const questionId = question.id ?? index + 1;
    card.dataset.editorCardKey = String(questionId);

    const title = document.createElement("div");
    title.className = "editor-card-title";
    title.textContent = `#${formatNumber(questionId)}`;

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
      preview.textContent = text || t("editorQuestionNoText");
    }

    const actions = document.createElement("div");
    actions.className = "editor-card-actions";

    const expand = document.createElement("div");
    expand.className = "editor-card-expand";

    const questionKey = String(question.id ?? index + 1);
    const handleSelectQuestion = () => {
      if (
        card === state.activeEditorCard &&
        state.activeEditorCardKey === questionKey &&
        editorMobileQuery.matches
      ) {
        return;
      }
      setEditorState("edit", question.id);
      syncEditorFormFromQuestion(question);
      renderEditorObjects(question);
      state.activeEditorCardKey = questionKey;
      if (editorMobileQuery.matches) {
        showEditorPanelInCard(card, questionKey);
      } else {
        syncEditorPanelLocation();
      }
    };

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = t("commonDelete");
    deleteButton.addEventListener("click", async () => {
      if (!state.currentTest) {
        return;
      }
      const confirmed = window.confirm(
        t("confirmDeleteQuestion", {
          id: formatNumber(question.id ?? index + 1),
        })
      );
      if (!confirmed) {
        return;
      }
      if (onDeleteQuestion) {
        await onDeleteQuestion(question.id);
      }
    });

    actions.append(deleteButton);
    card.append(title, preview, actions, expand);
    card.addEventListener("click", handleSelectQuestion);
    dom.editorQuestionList.appendChild(card);
  });

  if (editorMobileQuery.matches && state.activeEditorCardKey) {
    const targetCard = dom.editorQuestionList.querySelector(
      `[data-editor-card-key="${state.activeEditorCardKey}"]`
    );
    if (targetCard) {
      showEditorPanelInCard(targetCard, state.activeEditorCardKey);
    } else {
      state.activeEditorCardKey = null;
      syncEditorPanelLocation();
    }
  } else {
    syncEditorPanelLocation();
  }
}

export function setEditorObjectStatus(message, isError = false) {
  if (!dom.editorObjectStatus) {
    return;
  }
  dom.editorObjectStatus.textContent = message || "";
  dom.editorObjectStatus.classList.toggle("is-error", isError);
}

function updateEditorObjectToggles(showList, showUpload) {
  if (dom.editorObjectsToggle) {
    dom.editorObjectsToggle.textContent = showList
      ? t("editorObjectsToggleHide")
      : t("editorObjectsToggleShow");
  }
  if (dom.editorObjectUploadToggle) {
    dom.editorObjectUploadToggle.textContent = showUpload
      ? t("editorObjectUploadToggleHide")
      : t("editorObjectUploadToggleShow");
  }
}

export function setEditorObjectSection(section) {
  if (!dom.editorObjectUploadSection || !dom.editorObjectListSection) {
    return;
  }
  const showUpload = section === "upload";
  const showList = section === "list";
  dom.editorObjectUploadSection.classList.toggle("is-hidden", !showUpload);
  dom.editorObjectListSection.classList.toggle("is-hidden", !showList);
  updateEditorObjectToggles(showList, showUpload);
}

export function syncEditorObjectFields() {
  if (!dom.editorObjectType) {
    return;
  }
  const isFormula = dom.editorObjectType.value === "formula";
  dom.editorObjectFormulaFields?.classList.toggle("is-hidden", !isFormula);
  dom.editorObjectImageFields?.classList.toggle("is-hidden", isFormula);
}

export async function handleAddObject() {
  if (!state.currentTest) {
    setEditorObjectStatus(t("objectSelectTestFirst"), true);
    return;
  }
  const type = dom.editorObjectType?.value || "image";
  let id = dom.editorObjectId?.value.trim() ?? "";
  const registry = buildInlineRegistry(
    findEditorQuestion() ?? { objects: state.editorState.objects }
  );
  const usedFormulaIds = new Set();
  registry.forEach((inline, key) => {
    if (key.startsWith("formula:")) {
      usedFormulaIds.add(key.slice("formula:".length));
    }
  });
  if (!id && type !== "formula") {
    setEditorObjectStatus(t("objectIdRequired"), true);
    return;
  }
  if (!id && type === "formula") {
    id = generateShortFormulaId(usedFormulaIds);
  }
  const existingKey = `${type}:${id}`;
  if (registry.has(existingKey)) {
    setEditorObjectStatus(t("objectIdExists"), true);
    return;
  }

  try {
    if (type === "formula") {
      const xmlText = dom.editorObjectFormulaText?.value.trim() ?? "";
      let formulaText = xmlText;
      const file = dom.editorObjectFormulaFile?.files?.[0];
      if (!formulaText && file) {
        formulaText = (await file.text()).trim();
      }
      if (!formulaText) {
        setEditorObjectStatus(t("objectFormulaMissing"), true);
        return;
      }
      state.editorState.objects.push({
        type: "formula",
        id,
        mathml: formulaText,
      });
      setEditorObjectStatus(t("objectFormulaAdded"));
    } else {
      const file = dom.editorObjectImageFile?.files?.[0];
      if (!file) {
        setEditorObjectStatus(t("objectImageMissing"), true);
        return;
      }
      setEditorObjectStatus(t("objectUploading"));
      const asset = await uploadObjectAsset(state.currentTest.id, file);
      state.editorState.objects.push({
        type: "image",
        id,
        src: asset.src,
        alt: file.name || id,
      });
      setEditorObjectStatus(t("objectImageAdded"));
    }
    if (dom.editorObjectId) {
      dom.editorObjectId.value = "";
    }
    if (dom.editorObjectFormulaText) {
      dom.editorObjectFormulaText.value = "";
    }
    if (dom.editorObjectFormulaFile) {
      dom.editorObjectFormulaFile.value = "";
    }
    if (dom.editorObjectImageFile) {
      dom.editorObjectImageFile.value = "";
    }
    renderEditorObjects(findEditorQuestion());
  } catch (error) {
    setEditorObjectStatus(error.message, true);
  }
}
