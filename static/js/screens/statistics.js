/**
 * Statistics Screen - View attempt statistics
 */

import { fetchAttemptDetails, fetchAttemptStats } from "../api.js";
import { renderStatsView, setActiveScreen, hideStatsQuestionPreview } from "../rendering.js";
import { dom, state } from "../state.js";
import { getClientId } from "../telemetry.js";

/**
 * Open statistics screen for specific test (or all tests)
 */
export async function openStatsScreen(testId = null) {
  if (testId) {
    const { selectTest } = await import("./management.js");
    await selectTest(testId);
  }
  state.stats.filterTestId = testId;
  setActiveScreen("stats");
  populateTestFilter();
  await loadStatsData({ preserveSelection: false });
}

/**
 * Load statistics data from API
 */
export async function loadStatsData({ preserveSelection = true } = {}) {
  try {
    const clientId = getClientId();

    // Build filter options
    const options = {};
    if (state.stats.filterTestId) {
      options.testId = state.stats.filterTestId;
    }
    if (state.stats.filterStartDate) {
      options.startDate = state.stats.filterStartDate;
    }
    if (state.stats.filterEndDate) {
      options.endDate = state.stats.filterEndDate;
    }

    const response = await fetchAttemptStats(clientId, options);

    // Handle new API response format
    const attempts = response.attempts || response;
    state.stats.total = response.total ?? attempts.length;
    state.stats.attempts = attempts;

    if (!attempts.length) {
      state.stats.selectedAttemptId = null;
      state.stats.attemptDetails = null;
      renderStatsView();
      return;
    }

    if (
      !preserveSelection ||
      !attempts.some((attempt) => attempt.attemptId === state.stats.selectedAttemptId)
    ) {
      state.stats.selectedAttemptId = attempts[0]?.attemptId || null;
    }

    await loadAttemptDetails(state.stats.selectedAttemptId);
  } catch (error) {
    if (dom.statsQuestionStream) {
      dom.statsQuestionStream.textContent = error.message;
    } else {
      dom.questionContainer.textContent = error.message;
    }
  }
}

/**
 * Load detailed statistics for specific attempt
 */
export async function loadAttemptDetails(attemptId) {
  if (!attemptId) {
    state.stats.attemptDetails = null;
    renderStatsView();
    return;
  }

  try {
    const clientId = getClientId();
    const payload = await fetchAttemptDetails(attemptId, clientId);
    state.stats.attemptDetails = payload;
  } catch (error) {
    state.stats.attemptDetails = null;
  }

  renderStatsView();
}

/**
 * Apply filter changes and reload data
 */
export function applyFilters() {
  // Get filter values from DOM
  if (dom.statsFilterTestSelect) {
    const testValue = dom.statsFilterTestSelect.value;
    state.stats.filterTestId = testValue || null;
  }
  if (dom.statsFilterStartDate) {
    const startValue = dom.statsFilterStartDate.value;
    state.stats.filterStartDate = startValue || null;
  }
  if (dom.statsFilterEndDate) {
    const endValue = dom.statsFilterEndDate.value;
    state.stats.filterEndDate = endValue || null;
  }

  loadStatsData({ preserveSelection: false });
}

/**
 * Reset all filters and reload data
 */
export function resetFilters() {
  state.stats.filterTestId = null;
  state.stats.filterStartDate = null;
  state.stats.filterEndDate = null;

  // Reset DOM inputs
  if (dom.statsFilterTestSelect) {
    dom.statsFilterTestSelect.value = "";
  }
  if (dom.statsFilterStartDate) {
    dom.statsFilterStartDate.value = "";
  }
  if (dom.statsFilterEndDate) {
    dom.statsFilterEndDate.value = "";
  }

  loadStatsData({ preserveSelection: false });
}

/**
 * Populate test filter dropdown with available tests
 */
export function populateTestFilter() {
  if (!dom.statsFilterTestSelect) return;

  // Keep current value
  const currentValue = dom.statsFilterTestSelect.value;

  // Clear existing options except first (All tests)
  while (dom.statsFilterTestSelect.options.length > 1) {
    dom.statsFilterTestSelect.remove(1);
  }

  // Add test options
  for (const test of state.testsCache) {
    const option = document.createElement("option");
    option.value = test.id;
    option.textContent = test.title;
    dom.statsFilterTestSelect.appendChild(option);
  }

  // Restore value if still valid
  if (currentValue) {
    const exists = state.testsCache.some((t) => t.id === currentValue);
    if (exists) {
      dom.statsFilterTestSelect.value = currentValue;
    }
  }

  // Also set from state if filter is active
  if (state.stats.filterTestId) {
    dom.statsFilterTestSelect.value = state.stats.filterTestId;
  }
}

/**
 * Set view mode for statistics
 * @param {string} mode - "single" or "aggregate"
 */
export function setStatsViewMode(mode) {
  state.stats.viewMode = mode;

  // Update tab states
  dom.statsViewSingleTab?.classList.toggle("is-active", mode === "single");
  dom.statsViewAggregateTab?.classList.toggle("is-active", mode === "aggregate");

  // Show/hide single attempt controls
  if (dom.statsSingleControls) {
    dom.statsSingleControls.style.display = mode === "single" ? "" : "none";
  }

  // Re-render stats view
  renderStatsView();
}

/**
 * Initialize statistics screen event listeners
 */
export function initializeStatsScreenEvents() {
  dom.statsBackButton?.addEventListener("click", () => {
    setActiveScreen("management");
  });

  dom.statsRefreshButton?.addEventListener("click", () => {
    loadStatsData();
  });

  // View mode tabs
  dom.statsViewSingleTab?.addEventListener("click", () => {
    setStatsViewMode("single");
  });

  dom.statsViewAggregateTab?.addEventListener("click", () => {
    setStatsViewMode("aggregate");
  });

  // Filter event listeners
  dom.statsFilterTestSelect?.addEventListener("change", applyFilters);
  dom.statsFilterStartDate?.addEventListener("change", applyFilters);
  dom.statsFilterEndDate?.addEventListener("change", applyFilters);
  dom.statsFilterResetButton?.addEventListener("click", resetFilters);

  dom.statsAttemptSelect?.addEventListener("change", (event) => {
    const attemptId = event.target.value;
    state.stats.selectedAttemptId = attemptId;
    loadAttemptDetails(attemptId);
  });

  dom.statsAttemptList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-attempt-id]");
    if (!button) {
      return;
    }
    const attemptId = button.dataset.attemptId;
    state.stats.selectedAttemptId = attemptId;
    loadAttemptDetails(attemptId);
  });

  dom.statsStartTestButton?.addEventListener("click", async () => {
    const { selectTest } = await import("./management.js");

    if (!state.testsCache.length) {
      setActiveScreen("management");
      return;
    }

    const targetTestId =
      state.stats.filterTestId ||
      state.currentTest?.id ||
      state.testsCache[0]?.id;

    if (targetTestId) {
      await selectTest(targetTestId);
      setActiveScreen("testing");
    }
  });

  // Question preview close button
  dom.statsPreviewClose?.addEventListener("click", () => {
    hideStatsQuestionPreview();
  });
}
