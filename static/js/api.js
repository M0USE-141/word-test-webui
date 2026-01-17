import { readTestsCache, state, writeTestsCache } from "./state.js";
import { t } from "./i18n.js";

export async function fetchTests({ force = false } = {}) {
  if (!force) {
    if (state.testsCache.length) {
      return state.testsCache;
    }
    const cached = readTestsCache();
    if (cached.length) {
      state.testsCache = cached;
      return cached;
    }
  }

  const response = await fetch("/api/tests");
  if (!response.ok) {
    throw new Error(t("errorFetchTests"));
  }
  const data = await response.json();
  writeTestsCache(data);
  return data;
}

export async function fetchTest(testId) {
  const response = await fetch(`/api/tests/${testId}`);
  if (!response.ok) {
    throw new Error(t("errorFetchTest"));
  }
  return response.json();
}

export async function updateQuestion(testId, questionId, payload) {
  const response = await fetch(`/api/tests/${testId}/questions/${questionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorUpdateQuestion"));
  }
  return response.json();
}

export async function addQuestion(testId, payload) {
  const response = await fetch(`/api/tests/${testId}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorAddQuestion"));
  }
  return response.json();
}

export async function deleteQuestion(testId, questionId) {
  const response = await fetch(
    `/api/tests/${testId}/questions/${questionId}`,
    {
      method: "DELETE",
    }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorDeleteQuestion"));
  }
}

export async function renameTest(testId, title) {
  const response = await fetch(`/api/tests/${testId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || t("errorRenameTest");
    throw new Error(detail);
  }
  const tests = await fetchTests();
  state.testsCache = tests;
  return payload;
}

export async function createEmptyTest(title) {
  const response = await fetch("/api/tests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || t("errorCreateCollection");
    throw new Error(detail);
  }
  return payload;
}

export async function deleteTest(testId) {
  const response = await fetch(`/api/tests/${testId}`,
    {
      method: "DELETE",
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || t("errorDeleteTest");
    throw new Error(detail);
  }
  return payload;
}

export async function uploadObjectAsset(testId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/tests/${testId}/assets`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || t("errorUploadObject");
    throw new Error(detail);
  }
  return payload;
}

export async function fetchAnalytics(testId) {
  const url = testId
    ? `/api/tests/${testId}/analytics`
    : "/api/analytics";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(t("errorFetchAnalytics"));
  }
  return response.json();
}

export async function recordAttempt(testId, payload) {
  const response = await fetch(`/api/tests/${testId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorRecordAttempt"));
  }
  return response.json();
}
