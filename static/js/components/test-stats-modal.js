/**
 * Test Statistics Modal - Shows owner's view of test statistics
 */

import { fetchTestStatistics } from "../api.js";
import { dom, state } from "../state.js";
import { t, formatNumber, formatPercent } from "../i18n.js";

let currentTestId = null;
let currentTestTitle = null;

export function initializeTestStatsModalEvents() {
  dom.testStatsModal?.querySelector(".modal__close")?.addEventListener("click", closeTestStatsModal);
  dom.testStatsModal?.addEventListener("click", (event) => {
    if (event.target === dom.testStatsModal) {
      closeTestStatsModal();
    }
  });
}

export async function openTestStatsModal(testId, testTitle) {
  currentTestId = testId;
  currentTestTitle = testTitle;

  if (!dom.testStatsModal) return;

  const titleEl = dom.testStatsModal.querySelector("#test-stats-title");
  const contentEl = dom.testStatsModal.querySelector("#test-stats-content");
  const statusEl = dom.testStatsModal.querySelector("#test-stats-status");

  if (titleEl) {
    titleEl.textContent = testTitle || t("testStatisticsTitle");
  }

  if (contentEl) {
    contentEl.innerHTML = "";
  }

  if (statusEl) {
    statusEl.textContent = t("loading");
    statusEl.classList.remove("error");
  }

  dom.testStatsModal.showModal();

  try {
    const stats = await fetchTestStatistics(testId);
    renderTestStats(stats);
    if (statusEl) {
      statusEl.textContent = "";
    }
  } catch (error) {
    console.error("Error loading test statistics:", error);
    if (statusEl) {
      statusEl.textContent = error.message || t("errorFetchStats");
      statusEl.classList.add("error");
    }
  }
}

export function closeTestStatsModal() {
  currentTestId = null;
  currentTestTitle = null;
  dom.testStatsModal?.close();
}

function renderTestStats(stats) {
  const contentEl = dom.testStatsModal?.querySelector("#test-stats-content");
  if (!contentEl) return;

  const {
    totalAttempts,
    totalUsers,
    overallAvgPercent,
    overallAvgAccuracy,
    users,
    recentAttempts,
  } = stats;

  // Overview section
  const overviewHtml = `
    <div class="test-stats__overview">
      <div class="test-stats__kpi">
        <span class="test-stats__kpi-value">${totalAttempts}</span>
        <span class="test-stats__kpi-label">${t("totalAttempts")}</span>
      </div>
      <div class="test-stats__kpi">
        <span class="test-stats__kpi-value">${totalUsers}</span>
        <span class="test-stats__kpi-label">${t("totalUsers")}</span>
      </div>
      <div class="test-stats__kpi">
        <span class="test-stats__kpi-value">${overallAvgPercent !== null ? formatPercent(overallAvgPercent) : "—"}</span>
        <span class="test-stats__kpi-label">${t("avgPercent")}</span>
      </div>
      <div class="test-stats__kpi">
        <span class="test-stats__kpi-value">${overallAvgAccuracy !== null ? formatPercent(overallAvgAccuracy) : "—"}</span>
        <span class="test-stats__kpi-label">${t("avgAccuracy")}</span>
      </div>
    </div>
  `;

  // Users table
  let usersHtml = "";
  if (users && users.length > 0) {
    const usersRows = users.map((user, index) => `
      <tr>
        <td>${index + 1}</td>
        <td title="${user.clientId}">${user.clientId.substring(0, 8)}...</td>
        <td>${user.attemptCount}</td>
        <td>${user.bestAccuracy !== null ? formatPercent(user.bestAccuracy) : "—"}</td>
        <td>${user.avgAccuracy !== null ? formatPercent(user.avgAccuracy) : "—"}</td>
        <td>${user.totalScore}</td>
      </tr>
    `).join("");

    usersHtml = `
      <div class="test-stats__section">
        <h4 class="test-stats__section-title">${t("usersRanking")}</h4>
        <div class="test-stats__table-wrapper">
          <table class="test-stats__table">
            <thead>
              <tr>
                <th>#</th>
                <th>${t("user")}</th>
                <th>${t("attempts")}</th>
                <th>${t("bestAccuracy")}</th>
                <th>${t("avgAccuracy")}</th>
                <th>${t("totalScore")}</th>
              </tr>
            </thead>
            <tbody>
              ${usersRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    usersHtml = `
      <div class="test-stats__section">
        <p class="test-stats__empty">${t("noAttempts")}</p>
      </div>
    `;
  }

  // Recent attempts
  let recentHtml = "";
  if (recentAttempts && recentAttempts.length > 0) {
    const recentRows = recentAttempts.slice(0, 10).map((attempt) => {
      const date = attempt.completedAt
        ? new Date(attempt.completedAt).toLocaleString()
        : "—";
      return `
        <tr>
          <td title="${attempt.clientId}">${attempt.clientId.substring(0, 8)}...</td>
          <td>${attempt.score ?? "—"}</td>
          <td>${attempt.accuracy !== null ? formatPercent(attempt.accuracy) : "—"}</td>
          <td>${date}</td>
        </tr>
      `;
    }).join("");

    recentHtml = `
      <div class="test-stats__section">
        <h4 class="test-stats__section-title">${t("recentAttempts")}</h4>
        <div class="test-stats__table-wrapper">
          <table class="test-stats__table">
            <thead>
              <tr>
                <th>${t("user")}</th>
                <th>${t("score")}</th>
                <th>${t("accuracy")}</th>
                <th>${t("date")}</th>
              </tr>
            </thead>
            <tbody>
              ${recentRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  contentEl.innerHTML = overviewHtml + usersHtml + recentHtml;
}
