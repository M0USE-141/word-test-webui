/**
 * Statistics Screen - View attempt statistics
 */

import { fetchAttemptDetails, fetchAttemptStats } from "../api.js";
import { renderStatsView, setActiveScreen } from "../rendering.js";
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
  await loadStatsData({ preserveSelection: false });
}

/**
 * Load statistics data from API
 */
export async function loadStatsData({ preserveSelection = true } = {}) {
  try {
    const clientId = getClientId();
    const attempts = await fetchAttemptStats(clientId);

    const filtered = state.stats.filterTestId
      ? attempts.filter((attempt) => attempt.testId === state.stats.filterTestId)
      : attempts;

    const sorted = filtered
      .slice()
      .sort((a, b) => {
        const aDate = Date.parse(a.finalizedAt || a.createdAt || "");
        const bDate = Date.parse(b.finalizedAt || b.createdAt || "");
        if (Number.isNaN(aDate) || Number.isNaN(bDate)) {
          return 0;
        }
        return bDate - aDate;
      });

    state.stats.attempts = sorted;

    if (!sorted.length) {
      state.stats.selectedAttemptId = null;
      state.stats.attemptDetails = null;
      renderStatsView();
      return;
    }

    if (
      !preserveSelection ||
      !sorted.some((attempt) => attempt.attemptId === state.stats.selectedAttemptId)
    ) {
      state.stats.selectedAttemptId = sorted[0]?.attemptId || null;
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
 * Initialize statistics screen event listeners
 */
export function initializeStatsScreenEvents() {
  dom.statsBackButton?.addEventListener("click", () => {
    setActiveScreen("management");
  });

  dom.statsRefreshButton?.addEventListener("click", () => {
    loadStatsData();
  });

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
}
