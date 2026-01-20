import { readTestsCache, state, writeTestsCache } from "./state.js";
import { t } from "./i18n.js";
import { getAuthHeaders } from "./api/auth.js";

export async function fetchTests({ force = false, filter = null, limit = null, offset = 0 } = {}) {
  // Only use cache when no filter is specified
  if (!force && !filter) {
    if (state.testsCache.length) {
      return { tests: state.testsCache, total: state.testsCache.length, offset: 0, limit: null };
    }
    const cached = readTestsCache();
    if (cached.length) {
      state.testsCache = cached;
      return { tests: cached, total: cached.length, offset: 0, limit: null };
    }
  }

  const params = new URLSearchParams();
  if (filter) {
    params.append("filter", filter);
  }
  if (limit) {
    params.append("limit", limit.toString());
  }
  if (offset) {
    params.append("offset", offset.toString());
  }

  const url = params.toString() ? `/api/tests?${params.toString()}` : "/api/tests";
  const response = await fetch(url, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    throw new Error(t("errorFetchTests"));
  }
  const data = await response.json();

  // Handle new response format
  const tests = data.tests || data;
  const total = data.total ?? tests.length;

  // Only update cache when fetching all tests without filter
  if (!filter) {
    writeTestsCache(tests);
  }

  return { tests, total, offset: data.offset ?? offset, limit: data.limit ?? limit };
}

export async function fetchTest(testId) {
  const response = await fetch(`/api/tests/${testId}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    throw new Error(t("errorFetchTest"));
  }
  return response.json();
}

export async function updateQuestion(testId, questionId, payload) {
  const response = await fetch(`/api/tests/${testId}/questions/${questionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
      headers: { ...getAuthHeaders() },
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
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ title }),
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || t("errorRenameTest");
    throw new Error(detail);
  }
  const { tests } = await fetchTests();
  state.testsCache = tests;
  return payload;
}

export async function createEmptyTest(title, accessLevel = "private") {
  const response = await fetch("/api/tests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ title, access_level: accessLevel }),
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
      headers: { ...getAuthHeaders() },
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
    headers: { ...getAuthHeaders() },
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || t("errorUploadObject");
    throw new Error(detail);
  }
  return payload;
}

export async function fetchAttemptStats(clientId, options = {}) {
  const params = new URLSearchParams();
  params.append("clientId", clientId);

  if (options.testId) {
    params.append("testId", options.testId);
  }
  if (options.startDate) {
    params.append("startDate", options.startDate);
  }
  if (options.endDate) {
    params.append("endDate", options.endDate);
  }
  if (options.limit) {
    params.append("limit", options.limit.toString());
  }
  if (options.offset) {
    params.append("offset", options.offset.toString());
  }

  const response = await fetch(`/api/stats/attempts?${params.toString()}`);
  if (!response.ok) {
    throw new Error(t("errorFetchStats"));
  }
  return response.json();
}

export async function fetchAttemptDetails(attemptId, clientId) {
  const response = await fetch(
    `/api/stats/attempts/${attemptId}?clientId=${encodeURIComponent(clientId)}`
  );
  if (!response.ok) {
    throw new Error(t("errorFetchStats"));
  }
  return response.json();
}

export async function fetchTestStatistics(testId) {
  const response = await fetch(`/api/tests/${testId}/statistics`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorFetchStats"));
  }
  return response.json();
}

// Access Control API Functions

export async function getTestAccess(testId) {
  const response = await fetch(`/api/tests/${testId}/access`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorFetchAccess"));
  }
  return response.json();
}

export async function updateTestAccess(testId, accessLevel) {
  const response = await fetch(`/api/tests/${testId}/access`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ access_level: accessLevel }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorUpdateAccess"));
  }
  return response.json();
}

export async function getTestShares(testId) {
  const response = await fetch(`/api/tests/${testId}/shares`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorFetchShares"));
  }
  return response.json();
}

export async function addTestShare(testId, username) {
  const response = await fetch(`/api/tests/${testId}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ username }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorAddShare"));
  }
  return response.json();
}

export async function removeTestShare(testId, userId) {
  const response = await fetch(`/api/tests/${testId}/shares/${userId}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorRemoveShare"));
  }
  return response.json();
}

// Change Request API Functions

export async function checkCanProposeChanges(testId) {
  const response = await fetch(`/api/tests/${testId}/change-requests/can-propose`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorFetchChangeRequests"));
  }
  return response.json();
}

export async function createChangeRequest(testId, requestType, payload, questionId = null) {
  const body = {
    request_type: requestType,
    payload,
  };
  if (questionId) {
    body.question_id = String(questionId);
  }
  const response = await fetch(`/api/tests/${testId}/change-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorCreateChangeRequest"));
  }
  return response.json();
}

export async function fetchChangeRequests(testId, status = null, limit = 50, offset = 0) {
  let url = `/api/tests/${testId}/change-requests?limit=${limit}&offset=${offset}`;
  if (status) {
    url += `&status=${status}`;
  }
  const response = await fetch(url, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorFetchChangeRequests"));
  }
  return response.json();
}

export async function fetchChangeRequestStats(testId) {
  const response = await fetch(`/api/tests/${testId}/change-requests/stats`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorFetchChangeRequests"));
  }
  return response.json();
}

export async function approveChangeRequest(testId, requestId, comment = null) {
  const response = await fetch(`/api/tests/${testId}/change-requests/${requestId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ comment }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorApproveChangeRequest"));
  }
  return response.json();
}

export async function rejectChangeRequest(testId, requestId, comment = null) {
  const response = await fetch(`/api/tests/${testId}/change-requests/${requestId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ comment }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || t("errorRejectChangeRequest"));
  }
  return response.json();
}
