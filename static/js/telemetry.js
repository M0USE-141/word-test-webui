import { getSettings } from "./state.js";

const CLIENT_ID_KEY = "telemetry-client-id";
const EVENT_QUEUE_KEY = "telemetry-event-queue-v1";
const SUMMARY_QUEUE_KEY = "telemetry-summary-queue-v1";
const FLUSH_INTERVAL_MS = 10000;
const BATCH_SIZE = 10;

let flushTimer = null;

function generateId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function readQueue(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    return [];
  }
}

function writeQueue(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function enqueue(queueKey, item) {
  const queue = readQueue(queueKey);
  queue.push(item);
  writeQueue(queueKey, queue);
  if (queue.length >= BATCH_SIZE) {
    flushQueues();
  }
}

async function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function flushEventQueue() {
  if (!navigator.onLine) {
    return;
  }
  const queue = readQueue(EVENT_QUEUE_KEY);
  if (!queue.length) {
    return;
  }
  const remaining = [];
  for (const event of queue.slice(0, BATCH_SIZE)) {
    const attemptId = event?.attemptId;
    if (!attemptId) {
      continue;
    }
    const response = await postJson(
      `/api/attempts/${encodeURIComponent(attemptId)}/events`,
      event
    );
    if (!response.ok) {
      if (response.status !== 400 && response.status !== 422) {
        remaining.push(event);
      }
    }
  }
  const rest = queue.slice(BATCH_SIZE).concat(remaining);
  writeQueue(EVENT_QUEUE_KEY, rest);
  if (rest.length) {
    setTimeout(() => {
      flushEventQueue();
    }, 0);
  }
}

async function flushSummaryQueue() {
  if (!navigator.onLine) {
    return;
  }
  const queue = readQueue(SUMMARY_QUEUE_KEY);
  if (!queue.length) {
    return;
  }
  const remaining = [];
  for (const summary of queue.slice(0, BATCH_SIZE)) {
    const attemptId = summary?.attemptId;
    if (!attemptId) {
      continue;
    }
    const response = await postJson(
      `/api/attempts/${encodeURIComponent(attemptId)}/finalize`,
      summary
    );
    if (!response.ok) {
      if (response.status !== 400 && response.status !== 422) {
        remaining.push(summary);
      }
    }
  }
  const rest = queue.slice(BATCH_SIZE).concat(remaining);
  writeQueue(SUMMARY_QUEUE_KEY, rest);
  if (rest.length) {
    setTimeout(() => {
      flushSummaryQueue();
    }, 0);
  }
}

export function flushQueues() {
  flushEventQueue();
  flushSummaryQueue();
}

export function initTelemetry() {
  if (flushTimer) {
    return;
  }
  flushTimer = window.setInterval(() => {
    flushQueues();
  }, FLUSH_INTERVAL_MS);
  window.addEventListener("online", flushQueues);
  flushQueues();
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

function basePayload(session) {
  return {
    attemptId: session?.attemptId ?? null,
    testId: session?.testId ?? null,
    clientId: session?.clientId ?? getClientId(),
    ts: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    settings: session?.settings ?? getSettings(),
  };
}

function resolveAnswerId(options, index) {
  if (index === null || index === undefined || index === -1) {
    return null;
  }
  return options?.[index]?.id ?? index;
}

export function trackEvent(
  type,
  {
    session,
    questionEntry,
    questionIndex = null,
    answerIndex = null,
    options = [],
    isCorrect = null,
    durationMs = null,
    isSkipped = null,
  } = {}
) {
  const payload = {
    eventType: type,
    ...basePayload(session),
    questionId: questionEntry?.questionId ?? null,
    questionIndex,
    answerId: resolveAnswerId(options, answerIndex),
    isCorrect,
    durationMs,
    isSkipped,
  };
  if (!payload.attemptId || !payload.testId || !payload.clientId) {
    return;
  }
  enqueue(EVENT_QUEUE_KEY, payload);
}

export function trackAttemptStarted(session) {
  trackEvent("attempt_started", { session });
}

export function trackAttemptFinished(session, summary) {
  trackEvent("attempt_finished", { session, durationMs: summary.totalDurationMs });
  enqueue(SUMMARY_QUEUE_KEY, summary);
}

export function trackAttemptAbandoned(session) {
  trackEvent("attempt_abandoned", { session });
}

export function trackQuestionShown(session, questionEntry, questionIndex) {
  trackEvent("question_shown", {
    session,
    questionEntry,
    questionIndex,
  });
}

export function trackQuestionSkipped(session, questionEntry, questionIndex, durationMs) {
  trackEvent("question_skipped", {
    session,
    questionEntry,
    questionIndex,
    durationMs,
    isSkipped: true,
  });
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
  trackEvent(type, {
    session,
    questionEntry,
    questionIndex,
    answerIndex,
    options,
    isCorrect,
    durationMs,
    isSkipped: false,
  });
}

export function updateQuestionTiming(session, nextQuestionId) {
  if (!session) {
    return;
  }
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
  if (!session) {
    return;
  }
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

function average(values) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

export function buildAttemptSummary(session) {
  const now = Date.now();
  const total = session.questions.length;
  let answeredCount = 0;
  let correctCount = 0;

  const perQuestion = session.questions.map((entry, index) => {
    const selectedIndex = session.answers.get(entry.questionId);
    const options =
      session.optionOrders.get(entry.questionId) ?? entry.question.options;
    const correctIndex = options.findIndex((option) => option.isCorrect);
    const isAnswered = selectedIndex !== undefined && selectedIndex !== -1;
    const isCorrect =
      isAnswered && correctIndex !== -1
        ? Boolean(options[selectedIndex]?.isCorrect)
        : null;
    const timing = session.questionTimings.get(entry.questionId) ?? {
      totalMs: 0,
      shownCount: 0,
    };
    if (isAnswered) {
      answeredCount += 1;
      if (isCorrect) {
        correctCount += 1;
      }
    }
    const isSkipped = !isAnswered;
    return {
      questionId: entry.questionId,
      questionIndex: index,
      answerId: resolveAnswerId(options, selectedIndex),
      isCorrect,
      durationMs: timing.totalMs,
      shownCount: timing.shownCount,
      isSkipped,
    };
  });

  const skippedCount = total - answeredCount;
  const percentCorrect = total ? (correctCount / total) * 100 : 0;
  const questionDurations = perQuestion.map((item) => item.durationMs || 0);
  const totalDurationMs = session.startedAt ? now - session.startedAt : 0;
  const questionDurationTotalMs = questionDurations.reduce(
    (sum, value) => sum + value,
    0
  );
  const avgTimePerQuestion = total
    ? questionDurationTotalMs / total
    : 0;

  const third = Math.max(1, Math.floor(questionDurations.length / 3));
  const firstSlice = questionDurations.slice(0, third);
  const lastSlice = questionDurations.slice(-third);
  const firstAvg = average(firstSlice);
  const lastAvg = average(lastSlice);
  const fatiguePoint = firstAvg ? (lastAvg - firstAvg) / firstAvg : 0;

  const mean = average(questionDurations);
  const focusStabilityIndex = mean
    ? Math.max(0, 1 - standardDeviation(questionDurations) / mean)
    : 0;

  const personalDifficultyScore = total
    ? Math.max(0, 1 - correctCount / total)
    : 0;

  return {
    ...basePayload(session),
    score: correctCount,
    percentCorrect,
    completed: Boolean(session.finished),
    answeredCount,
    skippedCount,
    totalDurationMs,
    avgTimePerQuestion,
    perQuestion,
    fatiguePoint,
    focusStabilityIndex,
    personalDifficultyScore,
  };
}
