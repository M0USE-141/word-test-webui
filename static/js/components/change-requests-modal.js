/**
 * Change Requests Modal component for owners to review proposed changes.
 */

import { dom, state } from "../state.js";
import { t } from "../i18n.js";
import {
  fetchChangeRequests,
  fetchChangeRequestStats,
  approveChangeRequest,
  rejectChangeRequest,
} from "../api.js";

let currentTestId = null;
let currentFilter = null;

/**
 * Open change requests modal for a test.
 * @param {string} testId
 * @param {string} testTitle
 */
export async function openChangeRequestsModal(testId, testTitle) {
  if (!dom.changeRequestsModal) return;

  currentTestId = testId;
  currentFilter = null;

  // Set test name
  if (dom.changeRequestsTestName) {
    dom.changeRequestsTestName.textContent = testTitle;
  }

  // Reset status
  setChangeRequestsStatus("");

  // Show modal
  dom.changeRequestsModal.classList.add("is-open");
  dom.changeRequestsModal.setAttribute("aria-hidden", "false");

  // Load data
  await refreshChangeRequests();
}

/**
 * Close change requests modal.
 */
export function closeChangeRequestsModal() {
  if (!dom.changeRequestsModal) return;

  dom.changeRequestsModal.classList.remove("is-open");
  dom.changeRequestsModal.setAttribute("aria-hidden", "true");
  currentTestId = null;
}

/**
 * Refresh change requests from API.
 */
async function refreshChangeRequests() {
  if (!currentTestId) return;

  try {
    // Load stats
    const stats = await fetchChangeRequestStats(currentTestId);
    renderStats(stats);

    // Load requests
    const data = await fetchChangeRequests(currentTestId, currentFilter);
    renderChangeRequestsList(data.items);
  } catch (error) {
    setChangeRequestsStatus(error.message, true);
  }
}

/**
 * Render statistics.
 * @param {Object} stats
 */
function renderStats(stats) {
  if (!dom.changeRequestsStats) return;

  dom.changeRequestsStats.innerHTML = `
    <div class="cr-stat cr-stat--pending" data-filter="pending">
      <span class="cr-stat__count">${stats.pending}</span>
      <span class="cr-stat__label">${t("crStatsPending")}</span>
    </div>
    <div class="cr-stat cr-stat--approved" data-filter="approved">
      <span class="cr-stat__count">${stats.approved}</span>
      <span class="cr-stat__label">${t("crStatsApproved")}</span>
    </div>
    <div class="cr-stat cr-stat--rejected" data-filter="rejected">
      <span class="cr-stat__count">${stats.rejected}</span>
      <span class="cr-stat__label">${t("crStatsRejected")}</span>
    </div>
  `;

  // Add click handlers for filtering
  dom.changeRequestsStats.querySelectorAll(".cr-stat").forEach((stat) => {
    stat.addEventListener("click", () => {
      const filter = stat.dataset.filter;
      currentFilter = currentFilter === filter ? null : filter;
      updateFilterState();
      refreshChangeRequests();
    });
  });

  updateFilterState();
}

/**
 * Update filter visual state.
 */
function updateFilterState() {
  if (!dom.changeRequestsStats) return;

  dom.changeRequestsStats.querySelectorAll(".cr-stat").forEach((stat) => {
    const isActive = stat.dataset.filter === currentFilter;
    stat.classList.toggle("is-active", isActive);
  });
}

/**
 * Render change requests list.
 * @param {Array} requests
 */
function renderChangeRequestsList(requests) {
  if (!dom.changeRequestsList) return;

  dom.changeRequestsList.innerHTML = "";

  if (!requests || requests.length === 0) {
    const emptyItem = document.createElement("div");
    emptyItem.className = "cr-empty muted";
    emptyItem.textContent = t("noChangeRequests");
    dom.changeRequestsList.appendChild(emptyItem);
    return;
  }

  requests.forEach((cr) => {
    const card = createChangeRequestCard(cr);
    dom.changeRequestsList.appendChild(card);
  });
}

/**
 * Create a change request card element.
 * @param {Object} cr
 * @returns {HTMLElement}
 */
function createChangeRequestCard(cr) {
  const card = document.createElement("div");
  card.className = `cr-card cr-card--${cr.status}`;
  card.dataset.id = cr.id;

  // Header
  const header = document.createElement("div");
  header.className = "cr-card__header";

  const typeLabel = getRequestTypeLabel(cr.request_type);
  const typeEl = document.createElement("span");
  typeEl.className = `cr-type cr-type--${cr.request_type}`;
  typeEl.textContent = typeLabel;

  const statusEl = document.createElement("span");
  statusEl.className = `cr-status cr-status--${cr.status}`;
  statusEl.textContent = getStatusLabel(cr.status);

  header.append(typeEl, statusEl);

  // Meta
  const meta = document.createElement("div");
  meta.className = "cr-card__meta";

  const userEl = document.createElement("span");
  userEl.textContent = t("crProposedBy", { username: cr.username });

  const dateEl = document.createElement("span");
  dateEl.className = "muted";
  dateEl.textContent = formatDate(cr.created_at);

  meta.append(userEl, dateEl);

  // Payload preview
  const preview = document.createElement("div");
  preview.className = "cr-card__preview";
  preview.innerHTML = renderPayloadPreview(cr);

  card.append(header, meta, preview);

  // Actions (only for pending)
  if (cr.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "cr-card__actions";

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "cr-btn cr-btn--approve";
    approveBtn.textContent = t("crApprove");
    approveBtn.addEventListener("click", () => handleApprove(cr.id));

    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "cr-btn cr-btn--reject";
    rejectBtn.textContent = t("crReject");
    rejectBtn.addEventListener("click", () => handleReject(cr.id));

    actions.append(approveBtn, rejectBtn);
    card.appendChild(actions);
  }

  // Review info (for reviewed requests)
  if (cr.status !== "pending" && cr.reviewer_username) {
    const reviewInfo = document.createElement("div");
    reviewInfo.className = "cr-card__review";

    const reviewerEl = document.createElement("span");
    reviewerEl.className = "muted";
    reviewerEl.textContent = t("crReviewedBy", {
      username: cr.reviewer_username,
      date: formatDate(cr.reviewed_at),
    });

    reviewInfo.appendChild(reviewerEl);

    if (cr.review_comment) {
      const commentEl = document.createElement("p");
      commentEl.className = "cr-card__comment";
      commentEl.textContent = cr.review_comment;
      reviewInfo.appendChild(commentEl);
    }

    card.appendChild(reviewInfo);
  }

  return card;
}

/**
 * Get request type label.
 * @param {string} type
 * @returns {string}
 */
function getRequestTypeLabel(type) {
  const labels = {
    add_question: t("crTypeAddQuestion"),
    edit_question: t("crTypeEditQuestion"),
    delete_question: t("crTypeDeleteQuestion"),
    edit_settings: t("crTypeEditSettings"),
  };
  return labels[type] || type;
}

/**
 * Get status label.
 * @param {string} status
 * @returns {string}
 */
function getStatusLabel(status) {
  const labels = {
    pending: t("crStatusPending"),
    approved: t("crStatusApproved"),
    rejected: t("crStatusRejected"),
  };
  return labels[status] || status;
}

/**
 * Render payload preview.
 * @param {Object} cr
 * @returns {string}
 */
function renderPayloadPreview(cr) {
  const payload = cr.payload || {};

  if (cr.request_type === "delete_question") {
    return `<span class="muted">${t("crDeleteQuestionPreview", { id: cr.question_id })}</span>`;
  }

  if (cr.request_type === "edit_settings") {
    if (payload.title) {
      return `<span>${t("crEditSettingsPreview", { title: payload.title })}</span>`;
    }
    return `<span class="muted">${t("crEditSettingsGeneric")}</span>`;
  }

  // For add/edit question, show question text preview
  let questionText = "";
  if (payload.question?.blocks) {
    questionText = payload.question.blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ");
  } else if (payload.questionText) {
    questionText = payload.questionText;
  }

  if (questionText) {
    const truncated = questionText.length > 100
      ? questionText.substring(0, 100) + "..."
      : questionText;
    return `<span>${truncated}</span>`;
  }

  return `<span class="muted">${t("crNoPreview")}</span>`;
}

/**
 * Format date for display.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Handle approve action.
 * @param {number} requestId
 */
async function handleApprove(requestId) {
  if (!currentTestId) return;

  const comment = prompt(t("crApproveComment"));

  setChangeRequestsStatus(t("crApproving"));

  try {
    await approveChangeRequest(currentTestId, requestId, comment);
    setChangeRequestsStatus(t("crApproved"), false, true);
    await refreshChangeRequests();

    // Refresh current test data if in editor
    if (state.currentTest?.id === currentTestId) {
      const { refreshCurrentTest } = await import("../screens/management.js");
      await refreshCurrentTest(currentTestId);
    }
  } catch (error) {
    setChangeRequestsStatus(error.message, true);
  }
}

/**
 * Handle reject action.
 * @param {number} requestId
 */
async function handleReject(requestId) {
  if (!currentTestId) return;

  const comment = prompt(t("crRejectComment"));

  setChangeRequestsStatus(t("crRejecting"));

  try {
    await rejectChangeRequest(currentTestId, requestId, comment);
    setChangeRequestsStatus(t("crRejected"), false, true);
    await refreshChangeRequests();
  } catch (error) {
    setChangeRequestsStatus(error.message, true);
  }
}

/**
 * Set status message.
 * @param {string} message
 * @param {boolean} isError
 * @param {boolean} isSuccess
 */
function setChangeRequestsStatus(message, isError = false, isSuccess = false) {
  if (!dom.changeRequestsStatus) return;

  dom.changeRequestsStatus.textContent = message;
  dom.changeRequestsStatus.classList.toggle("is-error", isError);
  dom.changeRequestsStatus.classList.toggle("is-success", isSuccess);
}

/**
 * Initialize change requests modal event listeners.
 */
export function initializeChangeRequestsModalEvents() {
  // Close modal
  dom.closeChangeRequestsButton?.addEventListener("click", closeChangeRequestsModal);

  // Close on backdrop click
  dom.changeRequestsModal?.addEventListener("click", (event) => {
    if (event.target === dom.changeRequestsModal) {
      closeChangeRequestsModal();
    }
  });

  // Refresh button
  dom.changeRequestsRefreshButton?.addEventListener("click", () => {
    refreshChangeRequests();
  });
}
