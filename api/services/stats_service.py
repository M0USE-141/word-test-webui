"""Service layer for statistics calculation."""
from api.config import ATTEMPTS_INDEX_PATH, STATS_VERSION
from api.utils import (
    attempt_stats_path,
    parse_iso_timestamp,
    read_json_file,
    utc_now,
    write_json_file,
)
from api.services.attempt_service import iter_attempt_metas


def load_attempt_stats(attempt_id: str) -> dict[str, object]:
    """Load attempt statistics."""
    data = read_json_file(attempt_stats_path(attempt_id), {})
    return data if isinstance(data, dict) else {}


def load_attempt_index() -> list[dict[str, object]]:
    """Load attempt index."""
    payload = read_json_file(ATTEMPTS_INDEX_PATH, [])
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def write_attempt_index(entries: list[dict[str, object]]) -> None:
    """Write attempt index."""
    write_json_file(ATTEMPTS_INDEX_PATH, entries)


def resolve_metric(
    source: dict[str, object] | None,
    keys: list[str],
) -> float | int | None:
    """Resolve metric from source by trying multiple keys."""
    if not isinstance(source, dict):
        return None
    for key in keys:
        value = source.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return value
    return None


def extract_cached_metrics(
    aggregates: dict[str, object] | None,
    summary: dict[str, object] | None,
) -> dict[str, float | int | None]:
    """Extract cached metrics from aggregates or summary."""
    return {
        "score": resolve_metric(aggregates, ["score", "correct"])
        or resolve_metric(summary, ["score", "correct"]),
        "percent": resolve_metric(aggregates, ["percent", "percentCorrect"])
        or resolve_metric(summary, ["percent", "percentCorrect"]),
        "accuracy": resolve_metric(aggregates, ["accuracy"])
        or resolve_metric(summary, ["accuracy"]),
        "answerRate": resolve_metric(aggregates, ["answerRate"])
        or resolve_metric(summary, ["answerRate"]),
        "answeredCount": resolve_metric(aggregates, ["answeredCount", "answered"])
        or resolve_metric(summary, ["answeredCount", "answered"]),
        "incorrectCount": resolve_metric(aggregates, ["incorrectCount"])
        or resolve_metric(summary, ["incorrectCount"]),
        "skippedCount": resolve_metric(aggregates, ["skippedCount", "skipped"])
        or resolve_metric(summary, ["skippedCount", "skipped"]),
        "avgTimePerQuestion": resolve_metric(
            aggregates, ["avgTimePerQuestion", "avgTime"]
        )
        or resolve_metric(summary, ["avgTimePerQuestion", "avgTime"]),
        "fatiguePoint": resolve_metric(aggregates, ["fatiguePoint"])
        or resolve_metric(summary, ["fatiguePoint"]),
        "focusStabilityIndex": resolve_metric(aggregates, ["focusStabilityIndex"])
        or resolve_metric(summary, ["focusStabilityIndex"]),
        "personalDifficultyScore": resolve_metric(
            aggregates, ["personalDifficultyScore"]
        )
        or resolve_metric(summary, ["personalDifficultyScore"]),
        "questionCountUsed": resolve_metric(aggregates, ["questionCountUsed"])
        or resolve_metric(summary, ["questionCountUsed"]),
    }


def upsert_attempt_index_entry(
    attempt_id: str,
    test_id: str,
    client_id: str,
    started_at: str | None = None,
    completed_at: str | None = None,
    score: float | int | None = None,
    percent: float | int | None = None,
    accuracy: float | int | None = None,
    answered_count: float | int | None = None,
    skipped_count: float | int | None = None,
    avg_time_per_question: float | int | None = None,
    fatigue_point: float | int | None = None,
    focus_stability_index: float | int | None = None,
    personal_difficulty_score: float | int | None = None,
    question_count_used: float | int | None = None,
    stats_version: int | None = None,
) -> dict[str, object]:
    """Upsert entry in attempt index."""
    entries = load_attempt_index()
    entry = next(
        (item for item in entries if item.get("attemptId") == attempt_id),
        None,
    )

    if entry is None:
        entry = {
            "attemptId": attempt_id,
            "testId": test_id,
            "clientId": client_id,
            "startedAt": started_at,
            "completedAt": completed_at,
            "score": score,
            "percent": percent,
            "accuracy": accuracy,
            "answeredCount": answered_count,
            "skippedCount": skipped_count,
            "avgTimePerQuestion": avg_time_per_question,
            "fatiguePoint": fatigue_point,
            "focusStabilityIndex": focus_stability_index,
            "personalDifficultyScore": personal_difficulty_score,
            "questionCountUsed": question_count_used,
            "statsVersion": stats_version,
        }
        entries.append(entry)
        write_attempt_index(entries)
        return entry

    if started_at and not entry.get("startedAt"):
        entry["startedAt"] = started_at
    if completed_at:
        entry["completedAt"] = completed_at
    if score is not None:
        entry["score"] = score
    if percent is not None:
        entry["percent"] = percent
    if accuracy is not None:
        entry["accuracy"] = accuracy
    if answered_count is not None:
        entry["answeredCount"] = answered_count
    if skipped_count is not None:
        entry["skippedCount"] = skipped_count
    if avg_time_per_question is not None:
        entry["avgTimePerQuestion"] = avg_time_per_question
    if fatigue_point is not None:
        entry["fatiguePoint"] = fatigue_point
    if focus_stability_index is not None:
        entry["focusStabilityIndex"] = focus_stability_index
    if personal_difficulty_score is not None:
        entry["personalDifficultyScore"] = personal_difficulty_score
    if question_count_used is not None:
        entry["questionCountUsed"] = question_count_used
    if stats_version is not None:
        entry["statsVersion"] = stats_version
    write_attempt_index(entries)
    return entry


def rebuild_attempt_index() -> list[dict[str, object]]:
    """Rebuild attempt index from all attempt metadata."""
    entries: list[dict[str, object]] = []
    for attempt_payload in iter_attempt_metas():
        attempt_id = attempt_payload.get("attemptId")
        test_id = attempt_payload.get("testId")
        client_id = attempt_payload.get("clientId")
        if not attempt_id or not test_id or not client_id:
            continue

        stats_payload = load_attempt_stats(str(attempt_id))
        aggregates = stats_payload.get("aggregates")
        summary = stats_payload.get("summary")
        metrics = extract_cached_metrics(aggregates, summary)

        timestamps = attempt_payload.get("timestamps", {})
        if not isinstance(timestamps, dict):
            timestamps = {}

        entries.append(
            {
                "attemptId": attempt_id,
                "testId": test_id,
                "clientId": client_id,
                "startedAt": timestamps.get("createdAt"),
                "completedAt": timestamps.get("finalizedAt"),
                "score": metrics["score"],
                "percent": metrics["percent"],
                "accuracy": metrics["accuracy"],
                "answeredCount": metrics["answeredCount"],
                "skippedCount": metrics["skippedCount"],
                "avgTimePerQuestion": metrics["avgTimePerQuestion"],
                "fatiguePoint": metrics["fatiguePoint"],
                "focusStabilityIndex": metrics["focusStabilityIndex"],
                "personalDifficultyScore": metrics["personalDifficultyScore"],
                "questionCountUsed": metrics["questionCountUsed"],
                "statsVersion": stats_payload.get("statsVersion"),
            }
        )
    write_attempt_index(entries)
    return entries


def build_attempt_summary_from_events(
    attempt_id: str,
    attempt_meta: dict[str, object],
    test_payload: dict[str, object],
    events: list[dict[str, object]],
) -> dict[str, object]:
    """Build attempt summary from events."""
    questions = test_payload.get("questions", [])
    if not isinstance(questions, list):
        questions = []

    answer_events: dict[int, dict[str, object]] = {}
    attempt_started = None
    attempt_finished = None
    attempt_finished_duration = None

    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = event.get("eventType")
        question_id = event.get("questionId")

        if event_type in {"answer_selected", "answer_changed", "question_skipped"}:
            if isinstance(question_id, int):
                answer_events[question_id] = event
        if event_type == "attempt_started":
            attempt_started = parse_iso_timestamp(event.get("ts"))
        if event_type == "attempt_finished":
            attempt_finished = parse_iso_timestamp(event.get("ts"))
            duration = event.get("durationMs")
            if isinstance(duration, (int, float)) and not isinstance(duration, bool):
                attempt_finished_duration = int(duration)

    total = len(questions)
    answered_count = 0
    correct_count = 0
    per_question = []
    durations = []

    for index, entry in enumerate(questions):
        if not isinstance(entry, dict):
            continue
        question_id = entry.get("id")
        if not isinstance(question_id, int):
            continue

        event = answer_events.get(question_id)
        is_answered = False
        is_correct = None
        duration_ms = 0
        answer_index = None

        if event:
            event_type = event.get("eventType")
            if event_type in {"answer_selected", "answer_changed"}:
                is_answered = True
                is_correct = event.get("isCorrect")
                if not isinstance(is_correct, bool):
                    is_correct = None
                # Get selected answer index
                answer_idx = event.get("answerIndex")
                if isinstance(answer_idx, int):
                    answer_index = answer_idx
            if event_type == "question_skipped":
                is_answered = False
            duration_value = event.get("durationMs")
            if isinstance(duration_value, (int, float)) and not isinstance(
                duration_value, bool
            ):
                duration_ms = int(duration_value)

        if is_answered:
            answered_count += 1
            if is_correct is True:
                correct_count += 1

        durations.append(duration_ms)
        per_question.append(
            {
                "questionId": question_id,
                "index": index,
                "isCorrect": is_correct if is_answered else None,
                "durationMs": duration_ms,
                "isSkipped": not is_answered,
                "answerIndex": answer_index,
            }
        )

    skipped_count = total - answered_count

    # Get questionCount from settings (0 means all questions)
    settings = attempt_meta.get("settings", {})
    if not isinstance(settings, dict):
        settings = {}
    question_count_setting = settings.get("questionCount", 0)
    if not isinstance(question_count_setting, int) or question_count_setting <= 0:
        question_count_setting = 0

    # Determine the base for percentage calculations
    # If questionCount is set, use it; otherwise use total questions
    question_count_used = question_count_setting if question_count_setting > 0 else total

    # Calculate percentages based on questionCount
    percent_correct = (correct_count / question_count_used) * 100 if question_count_used else 0
    incorrect_count = answered_count - correct_count
    percent_incorrect = (incorrect_count / question_count_used) * 100 if question_count_used else 0
    unanswered_count = question_count_used - answered_count if question_count_used > answered_count else 0
    percent_unanswered = (unanswered_count / question_count_used) * 100 if question_count_used else 0

    # Accuracy is correct / answered (how accurate were the answers given)
    accuracy = (correct_count / answered_count) * 100 if answered_count else 0
    # Answer rate is answered / questionCount (completion rate)
    answer_rate = (answered_count / question_count_used) * 100 if question_count_used else 0

    accuracy_by_index: list[float | None] = []
    tempo_by_index: list[int] = []

    for item in per_question:
        if not isinstance(item, dict):
            continue
        is_correct = item.get("isCorrect")
        if isinstance(is_correct, bool):
            accuracy_by_index.append(100.0 if is_correct else 0.0)
        else:
            accuracy_by_index.append(None)
        duration_value = item.get("durationMs")
        if isinstance(duration_value, (int, float)) and not isinstance(
            duration_value, bool
        ):
            tempo_by_index.append(int(duration_value))
        else:
            tempo_by_index.append(0)

    total_duration_ms = 0
    if attempt_finished_duration is not None:
        total_duration_ms = attempt_finished_duration
    else:
        start_time = attempt_started
        end_time = attempt_finished
        if start_time and end_time:
            total_duration_ms = int((end_time - start_time).total_seconds() * 1000)

    question_duration_total_ms = sum(durations)
    avg_time_per_question = question_duration_total_ms / total if total else 0

    def _average(values: list[int]) -> float:
        if not values:
            return 0.0
        return sum(values) / len(values)

    def _average_optional(values: list[float | None]) -> float | None:
        filtered = [value for value in values if isinstance(value, (int, float))]
        if not filtered:
            return None
        return sum(filtered) / len(filtered)

    def _standard_deviation(values: list[int]) -> float:
        if len(values) < 2:
            return 0.0
        mean = _average(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        return variance**0.5

    # Calculate fatigue point
    accuracy_series: list[float | None] = []
    for item in per_question:
        is_correct = item.get("isCorrect")
        if isinstance(is_correct, bool):
            accuracy_series.append(1.0 if is_correct else 0.0)
        else:
            accuracy_series.append(None)

    window_size = max(1, len(accuracy_series) // 3) if accuracy_series else 1
    best_average: float | None = None
    fatigue_index: int | None = None

    for index in range(len(accuracy_series)):
        start = max(0, index - window_size + 1)
        window_avg = _average_optional(accuracy_series[start : index + 1])
        if window_avg is None:
            continue
        if best_average is None or window_avg > best_average:
            best_average = window_avg
        elif fatigue_index is None and window_avg < best_average:
            fatigue_index = index

    fatigue_point = (
        (fatigue_index + 1) / len(accuracy_series)
        if fatigue_index is not None and accuracy_series
        else 0
    )

    mean = _average(durations)
    focus_stability_index = (
        max(0.0, 1 - _standard_deviation(durations) / mean) if mean else 0.0
    )
    personal_difficulty_score = (
        max(0.0, 1 - correct_count / total) if total else 0.0
    )

    timestamps = attempt_meta.get("timestamps", {})
    if not isinstance(timestamps, dict):
        timestamps = {}
    completed = bool(
        timestamps.get("finalizedAt")
        or attempt_finished
        or any(event.get("eventType") == "attempt_finished" for event in events)
    )

    summary = {
        "attemptId": attempt_id,
        "testId": attempt_meta.get("testId"),
        "clientId": attempt_meta.get("clientId"),
        "ts": utc_now(),
        "timezone": "UTC",
        "settings": attempt_meta.get("settings", {}),
        "score": correct_count,
        "percentCorrect": percent_correct,
        "accuracy": accuracy,
        "answerRate": answer_rate,
        "completed": completed,
        "answeredCount": answered_count,
        "incorrectCount": incorrect_count,
        "unansweredCount": unanswered_count,
        "skippedCount": skipped_count,
        "totalDurationMs": total_duration_ms,
        "avgTimePerQuestion": avg_time_per_question,
        "perQuestion": per_question,
        "fatiguePoint": fatigue_point,
        "focusStabilityIndex": focus_stability_index,
        "personalDifficultyScore": personal_difficulty_score,
        "accuracyByIndex": accuracy_by_index,
        "tempoByIndex": tempo_by_index,
        "timeByIndex": tempo_by_index,
        "totalCount": total,
        "questionCountUsed": question_count_used,
        "percentIncorrect": percent_incorrect,
        "percentUnanswered": percent_unanswered,
    }
    return summary


def write_attempt_stats_from_summary(
    attempt_id: str,
    test_id: str,
    client_id: str,
    summary: dict[str, object],
    event_count: int,
) -> dict[str, object]:
    """Write attempt statistics from summary."""
    aggregates = {
        "score": summary.get("score"),
        "percentCorrect": summary.get("percentCorrect"),
        "percentIncorrect": summary.get("percentIncorrect"),
        "percentUnanswered": summary.get("percentUnanswered"),
        "accuracy": summary.get("accuracy"),
        "answerRate": summary.get("answerRate"),
        "answeredCount": summary.get("answeredCount"),
        "incorrectCount": summary.get("incorrectCount"),
        "unansweredCount": summary.get("unansweredCount"),
        "skippedCount": summary.get("skippedCount"),
        "avgTimePerQuestion": summary.get("avgTimePerQuestion"),
        "totalDurationMs": summary.get("totalDurationMs"),
        "fatiguePoint": summary.get("fatiguePoint"),
        "focusStabilityIndex": summary.get("focusStabilityIndex"),
        "personalDifficultyScore": summary.get("personalDifficultyScore"),
        "accuracyByIndex": summary.get("accuracyByIndex"),
        "tempoByIndex": summary.get("tempoByIndex") or summary.get("timeByIndex"),
        "timeByIndex": summary.get("timeByIndex"),
        "totalCount": summary.get("totalCount"),
        "questionCountUsed": summary.get("questionCountUsed"),
    }

    stats_payload = {
        "attemptId": attempt_id,
        "testId": test_id,
        "clientId": client_id,
        "statsVersion": STATS_VERSION,
        "aggregates": aggregates,
        "summary": summary,
        "perQuestion": summary.get("perQuestion", []),
        "eventCount": event_count,
    }

    write_json_file(attempt_stats_path(attempt_id), stats_payload)

    metrics = extract_cached_metrics(aggregates, summary)
    upsert_attempt_index_entry(
        attempt_id,
        test_id,
        client_id,
        score=metrics["score"],
        percent=metrics["percent"],
        accuracy=metrics["accuracy"],
        answered_count=metrics["answeredCount"],
        skipped_count=metrics["skippedCount"],
        avg_time_per_question=metrics["avgTimePerQuestion"],
        fatigue_point=metrics["fatiguePoint"],
        focus_stability_index=metrics["focusStabilityIndex"],
        personal_difficulty_score=metrics["personalDifficultyScore"],
        question_count_used=metrics["questionCountUsed"],
        stats_version=STATS_VERSION,
    )
    return stats_payload
