/**
 * Telemetry module for test attempts using SQLite-backed API.
 *
 * New API endpoints:
 * - POST /api/attempts/start - Start a new attempt with question snapshots
 * - POST /api/attempts/{id}/answer - Record an answer
 * - POST /api/attempts/{id}/finish - Finish attempt and calculate stats
 * - POST /api/attempts/{id}/abandon - Mark attempt as abandoned
 */

import { getSettings } from "./state.js";
import { getAuthHeaders } from "./api.js";

const CLIENT_ID_KEY = "telemetry-client-id";

// Pending requests queue for offline support
const PENDING_QUEUE_KEY = "telemetry-pending-queue-v2";
const FLUSH_INTERVAL_MS = 5000;

let flushTimer = null;

function generateId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function getClientId() {
  const stored = localStorage.getItem(CLIENT_ID_KEY);
  if (stored) {
    return stored;
  }
  const nextId = generateId();
  localStorage.setItem(CLIENT_ID_KEY, nextId);
  return nextId;
}

export function createAttemptId() {
  return generateId();
}

// Queue management for offline support
function readQueue() {
  const raw = localStorage.getItem(PENDING_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(items));
}

function enqueueRequest(request) {
  const queue = readQueue();
  queue.push(request);
  writeQueue(queue);
}

async function postJson(url, payload) {
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
  };
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

// Flush pending requests
async function flushPendingQueue() {
  if (!navigator.onLine) return;

  const queue = readQueue();
  if (!queue.length) return;

  const remaining = [];

  for (const request of queue) {
    try {
      const response = await postJson(request.url, request.payload);
      if (!response.ok && response.status >= 500) {
        // Server error, retry later
        remaining.push(request);
      }
      // 4xx errors are not retried (invalid data)
    } catch (error) {
      // Network error, retry later
      remaining.push(request);
    }
  }

  writeQueue(remaining);
}

export function flushQueues() {
  flushPendingQueue();
}

export function initTelemetry() {
  if (flushTimer) return;

  flushTimer = window.setInterval(flushPendingQueue, FLUSH_INTERVAL_MS);
  window.addEventListener("online", flushPendingQueue);
  flushPendingQueue();
}

/**
 * Start a new test attempt.
 * Sends question snapshots for later preview in statistics.
 */
export async function startAttempt(session) {
  if (!session?.attemptId || !session?.testId) return;

  const payload = {
    attemptId: session.attemptId,
    testId: session.testId,
    clientId: session.clientId || getClientId(),
    settings: session.settings || getSettings(),
    questions: session.questions.map((entry) => ({
      questionId: entry.questionId,
      question: entry.question,
    })),
  };

  const url = "/api/attempts/start";

  try {
    const response = await postJson(url, payload);
    if (!response.ok) {
      console.warn("Failed to start attempt:", response.status);
      enqueueRequest({ url, payload });
    }
  } catch (error) {
    console.warn("Failed to start attempt:", error);
    enqueueRequest({ url, payload });
  }
}

/**
 * Record an answer for a question.
 */
export async function recordAnswer(
  session,
  questionId,
  answerIndex,
  isCorrect,
  durationMs = 0
) {
  if (!session?.attemptId || !session?.testId) return;

  const payload = {
    testId: session.testId,
    clientId: session.clientId || getClientId(),
    questionId,
    answerIndex,
    isCorrect,
    durationMs,
    isSkipped: false,
  };

  const url = `/api/attempts/${encodeURIComponent(session.attemptId)}/answer`;

  try {
    const response = await postJson(url, payload);
    if (!response.ok && response.status >= 500) {
      enqueueRequest({ url, payload });
    }
  } catch (error) {
    enqueueRequest({ url, payload });
  }
}

/**
 * Record a skipped question.
 */
export async function recordSkip(session, questionId, durationMs = 0) {
  if (!session?.attemptId || !session?.testId) return;

  const payload = {
    testId: session.testId,
    clientId: session.clientId || getClientId(),
    questionId,
    answerIndex: null,
    isCorrect: null,
    durationMs,
    isSkipped: true,
  };

  const url = `/api/attempts/${encodeURIComponent(session.attemptId)}/answer`;

  try {
    const response = await postJson(url, payload);
    if (!response.ok && response.status >= 500) {
      enqueueRequest({ url, payload });
    }
  } catch (error) {
    enqueueRequest({ url, payload });
  }
}

/**
 * Finish an attempt and calculate final statistics.
 */
export async function finishAttempt(session, totalDurationMs = 0) {
  if (!session?.attemptId || !session?.testId) return;

  const payload = {
    testId: session.testId,
    clientId: session.clientId || getClientId(),
    totalDurationMs,
  };

  const url = `/api/attempts/${encodeURIComponent(session.attemptId)}/finish`;

  try {
    const response = await postJson(url, payload);
    if (!response.ok) {
      console.warn("Failed to finish attempt:", response.status);
      enqueueRequest({ url, payload });
    }
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.warn("Failed to finish attempt:", error);
    enqueueRequest({ url, payload });
    return null;
  }
}

/**
 * Mark an attempt as abandoned.
 */
export async function abandonAttempt(session) {
  if (!session?.attemptId) return;

  const url = `/api/attempts/${encodeURIComponent(session.attemptId)}/abandon`;

  try {
    await postJson(url, {});
  } catch (error) {
    // Abandon failures are not critical
    console.warn("Failed to abandon attempt:", error);
  }
}

// Legacy compatibility - these functions are called by existing code

export function trackAttemptStarted(session) {
  startAttempt(session);
}

export function trackAttemptFinished(session, summary) {
  finishAttempt(session, summary.totalDurationMs);
}

export function trackAttemptAbandoned(session) {
  abandonAttempt(session);
}

export function trackQuestionShown(session, questionEntry, questionIndex) {
  // No longer tracked as separate event - timing handled client-side
}

export function trackQuestionSkipped(session, questionEntry, questionIndex, durationMs) {
  recordSkip(session, questionEntry.questionId, durationMs);
}

export function trackAnswerEvent(
  type,
  session,
  questionEntry,
  questionIndex,
  answerIndex,
  options,
  isCorrect,
  durationMs
) {
  recordAnswer(session, questionEntry.questionId, answerIndex, isCorrect, durationMs);
}

// Timing utilities (still used client-side for duration tracking)

export function updateQuestionTiming(session, nextQuestionId) {
  if (!session) return;

  const now = Date.now();
  if (
    session.activeQuestionId !== null &&
    session.activeQuestionId !== undefined &&
    session.activeQuestionId !== nextQuestionId &&
    typeof session.activeQuestionStartedAt === "number"
  ) {
    const elapsed = Math.max(0, now - session.activeQuestionStartedAt);
    const existing = session.questionTimings.get(session.activeQuestionId) ?? {
      totalMs: 0,
      shownCount: 0,
    };
    existing.totalMs += elapsed;
    existing.shownCount += 1;
    session.questionTimings.set(session.activeQuestionId, existing);
  }
  if (session.activeQuestionId !== nextQuestionId) {
    session.activeQuestionId = nextQuestionId;
    session.activeQuestionStartedAt = now;
  }
}

export function finalizeActiveQuestionTiming(session) {
  if (!session) return;

  const now = Date.now();
  if (
    session.activeQuestionId !== null &&
    session.activeQuestionId !== undefined &&
    typeof session.activeQuestionStartedAt === "number"
  ) {
    const elapsed = Math.max(0, now - session.activeQuestionStartedAt);
    const existing = session.questionTimings.get(session.activeQuestionId) ?? {
      totalMs: 0,
      shownCount: 0,
    };
    existing.totalMs += elapsed;
    existing.shownCount += 1;
    session.questionTimings.set(session.activeQuestionId, existing);
  }
  session.activeQuestionStartedAt = null;
}

/**
 * Build attempt summary (still used for local result display).
 */
export function buildAttemptSummary(session) {
  const now = Date.now();
  const total = session.questions.length;
  let answeredCount = 0;
  let correctCount = 0;

  session.questions.forEach((entry) => {
    const selectedIndex = session.answers.get(entry.questionId);
    const isAnswered = selectedIndex !== undefined && selectedIndex !== -1;
    if (isAnswered) {
      answeredCount += 1;
      const options =
        session.optionOrders.get(entry.questionId) ?? entry.question.options;
      if (options[selectedIndex]?.isCorrect) {
        correctCount += 1;
      }
    }
  });

  const totalDurationMs = session.startedAt ? now - session.startedAt : 0;

  return {
    attemptId: session.attemptId,
    testId: session.testId,
    clientId: session.clientId || getClientId(),
    score: correctCount,
    total,
    answeredCount,
    percentCorrect: total ? (correctCount / total) * 100 : 0,
    totalDurationMs,
  };
}

// Legacy trackEvent function (no longer used, but kept for compatibility)
export function trackEvent() {
  // No-op - replaced by specific API calls
}
