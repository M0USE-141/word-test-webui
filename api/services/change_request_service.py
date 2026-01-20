"""Change request service for test editing proposals."""

import json
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession, joinedload

from api.models.db.change_request import ChangeRequest, ChangeRequestStatus, ChangeRequestType
from api.models.db.test_collection import TestCollection
from api.models.db.user import User
from api.services import access_service
from api.services.test_service import (
    extract_blocks,
    find_question,
    load_test_payload,
    save_test_payload,
    text_to_blocks,
)


def get_test_collection(db: DbSession, test_id: str) -> TestCollection | None:
    """Get test collection by test_id."""
    stmt = select(TestCollection).where(TestCollection.test_id == test_id)
    return db.execute(stmt).scalar_one_or_none()


def can_create_change_request(
    db: DbSession, test_id: str, user: User
) -> tuple[bool, bool, str | None]:
    """
    Check if user can create a change request.
    Returns (can_propose, is_owner, reason).
    """
    collection = get_test_collection(db, test_id)

    if not collection:
        return False, False, "Test not found"

    is_owner = collection.owner_id == user.id

    # Owner doesn't need to create change requests - they can edit directly
    if is_owner:
        return False, True, "Owner can edit directly"

    # Check if user has access to view the test
    if not access_service.can_view_test(db, test_id, user):
        return False, False, "Access denied"

    # Non-owner with view access can create change requests
    return True, False, None


def create_change_request(
    db: DbSession,
    test_id: str,
    user: User,
    request_type: ChangeRequestType,
    payload: dict,
    question_id: str | None = None,
) -> ChangeRequest:
    """Create a new change request."""
    collection = get_test_collection(db, test_id)
    if not collection:
        raise ValueError("Test not found")

    change_request = ChangeRequest(
        test_collection_id=collection.id,
        user_id=user.id,
        request_type=request_type.value,
        question_id=question_id,
        payload=json.dumps(payload),
        status=ChangeRequestStatus.PENDING.value,
    )

    db.add(change_request)
    db.commit()
    db.refresh(change_request)

    return change_request


def get_change_request(db: DbSession, request_id: int) -> ChangeRequest | None:
    """Get change request by ID with relationships loaded."""
    stmt = (
        select(ChangeRequest)
        .options(
            joinedload(ChangeRequest.user),
            joinedload(ChangeRequest.reviewer),
            joinedload(ChangeRequest.test_collection),
        )
        .where(ChangeRequest.id == request_id)
    )
    return db.execute(stmt).scalar_one_or_none()


def list_change_requests(
    db: DbSession,
    test_id: str,
    status: ChangeRequestStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ChangeRequest], int, int]:
    """
    List change requests for a test.
    Returns (items, total_count, pending_count).
    """
    collection = get_test_collection(db, test_id)
    if not collection:
        return [], 0, 0

    # Base query
    base_query = select(ChangeRequest).where(
        ChangeRequest.test_collection_id == collection.id
    )

    # Count total
    count_stmt = select(func.count()).select_from(
        base_query.subquery()
    )
    total = db.execute(count_stmt).scalar() or 0

    # Count pending
    pending_stmt = select(func.count()).where(
        ChangeRequest.test_collection_id == collection.id,
        ChangeRequest.status == ChangeRequestStatus.PENDING.value,
    )
    pending_count = db.execute(pending_stmt).scalar() or 0

    # Apply status filter
    if status:
        base_query = base_query.where(ChangeRequest.status == status.value)

    # Get items with pagination
    stmt = (
        base_query
        .options(
            joinedload(ChangeRequest.user),
            joinedload(ChangeRequest.reviewer),
        )
        .order_by(ChangeRequest.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    items = list(db.execute(stmt).scalars().all())
    return items, total, pending_count


def get_change_request_stats(db: DbSession, test_id: str) -> dict[str, int]:
    """Get statistics for change requests."""
    collection = get_test_collection(db, test_id)
    if not collection:
        return {"pending": 0, "approved": 0, "rejected": 0, "total": 0}

    # Count by status
    stmt = (
        select(ChangeRequest.status, func.count())
        .where(ChangeRequest.test_collection_id == collection.id)
        .group_by(ChangeRequest.status)
    )

    results = db.execute(stmt).all()
    counts = {status: count for status, count in results}

    pending = counts.get(ChangeRequestStatus.PENDING.value, 0)
    approved = counts.get(ChangeRequestStatus.APPROVED.value, 0)
    rejected = counts.get(ChangeRequestStatus.REJECTED.value, 0)

    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "total": pending + approved + rejected,
    }


def approve_change_request(
    db: DbSession,
    request_id: int,
    reviewer: User,
    comment: str | None = None,
) -> ChangeRequest:
    """Approve a change request and apply the changes."""
    change_request = get_change_request(db, request_id)
    if not change_request:
        raise ValueError("Change request not found")

    if change_request.status != ChangeRequestStatus.PENDING.value:
        raise ValueError("Change request is not pending")

    # Apply the changes
    test_id = change_request.test_collection.test_id
    _apply_change_request(test_id, change_request)

    # Update status
    change_request.status = ChangeRequestStatus.APPROVED.value
    change_request.reviewed_at = datetime.now(timezone.utc)
    change_request.reviewed_by = reviewer.id
    change_request.review_comment = comment

    db.commit()
    db.refresh(change_request)

    return change_request


def reject_change_request(
    db: DbSession,
    request_id: int,
    reviewer: User,
    comment: str | None = None,
) -> ChangeRequest:
    """Reject a change request."""
    change_request = get_change_request(db, request_id)
    if not change_request:
        raise ValueError("Change request not found")

    if change_request.status != ChangeRequestStatus.PENDING.value:
        raise ValueError("Change request is not pending")

    # Update status
    change_request.status = ChangeRequestStatus.REJECTED.value
    change_request.reviewed_at = datetime.now(timezone.utc)
    change_request.reviewed_by = reviewer.id
    change_request.review_comment = comment

    db.commit()
    db.refresh(change_request)

    return change_request


def _apply_change_request(test_id: str, change_request: ChangeRequest) -> None:
    """Apply a change request to the test."""
    payload = json.loads(change_request.payload)
    request_type = ChangeRequestType(change_request.request_type)

    if request_type == ChangeRequestType.ADD_QUESTION:
        _apply_add_question(test_id, payload)
    elif request_type == ChangeRequestType.EDIT_QUESTION:
        question_id = change_request.question_id
        if question_id:
            _apply_edit_question(test_id, int(question_id), payload)
    elif request_type == ChangeRequestType.DELETE_QUESTION:
        question_id = change_request.question_id
        if question_id:
            _apply_delete_question(test_id, int(question_id))
    elif request_type == ChangeRequestType.EDIT_SETTINGS:
        _apply_edit_settings(test_id, payload)


def _apply_add_question(test_id: str, payload: dict) -> None:
    """Apply add question change."""
    test_payload = load_test_payload(test_id)
    questions = test_payload.get("questions", [])
    if not isinstance(questions, list):
        questions = []

    question_blocks = extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is None:
        if isinstance(question_text, str) and question_text.strip():
            question_blocks = text_to_blocks(question_text)
        else:
            question_blocks = text_to_blocks("")

    options_payload = payload.get("options", [])
    if not isinstance(options_payload, list):
        options_payload = []

    next_id = max((q.get("id", 0) for q in questions if isinstance(q, dict)), default=0) + 1
    options = []
    correct_blocks = extract_blocks(payload.get("correct"))

    for index, option in enumerate(options_payload, start=1):
        if not isinstance(option, dict):
            continue

        content_blocks = extract_blocks(option.get("content"))
        if content_blocks is None:
            option_text = str(option.get("text", ""))
            content_blocks = text_to_blocks(option_text)

        is_correct = bool(option.get("isCorrect"))
        if is_correct and correct_blocks is None:
            correct_blocks = content_blocks

        options.append({
            "id": index,
            "content": {"blocks": content_blocks},
            "isCorrect": is_correct,
        })

    new_question = {
        "id": next_id,
        "question": {"blocks": question_blocks},
        "options": options,
        "correct": {"blocks": correct_blocks or text_to_blocks("")},
    }

    objects_payload = payload.get("objects")
    if isinstance(objects_payload, list):
        new_question["objects"] = objects_payload

    questions.append(new_question)
    test_payload["questions"] = questions
    save_test_payload(test_id, test_payload)


def _apply_edit_question(test_id: str, question_id: int, payload: dict) -> None:
    """Apply edit question change."""
    test_payload = load_test_payload(test_id)
    question, _ = find_question(test_payload, question_id)

    question_blocks = extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is not None:
        question["question"] = {"blocks": question_blocks}
    elif question_text is not None:
        question["question"] = {"blocks": text_to_blocks(str(question_text))}

    options_payload = payload.get("options")
    if options_payload is not None and isinstance(options_payload, list):
        options = []
        correct_blocks = extract_blocks(payload.get("correct"))

        for index, option in enumerate(options_payload, start=1):
            if not isinstance(option, dict):
                continue

            content_blocks = extract_blocks(option.get("content"))
            if content_blocks is None:
                option_text = str(option.get("text", ""))
                content_blocks = text_to_blocks(option_text)

            is_correct = bool(option.get("isCorrect"))
            if is_correct and correct_blocks is None:
                correct_blocks = content_blocks

            options.append({
                "id": index,
                "content": {"blocks": content_blocks},
                "isCorrect": is_correct,
            })

        question["options"] = options
        question["correct"] = {"blocks": correct_blocks or text_to_blocks("")}

    objects_payload = payload.get("objects")
    if objects_payload is not None and isinstance(objects_payload, list):
        question["objects"] = objects_payload

    save_test_payload(test_id, test_payload)


def _apply_delete_question(test_id: str, question_id: int) -> None:
    """Apply delete question change."""
    test_payload = load_test_payload(test_id)
    _, index = find_question(test_payload, question_id)

    questions = test_payload.get("questions", [])
    if isinstance(questions, list) and 0 <= index < len(questions):
        questions.pop(index)
        test_payload["questions"] = questions
        save_test_payload(test_id, test_payload)


def _apply_edit_settings(test_id: str, payload: dict) -> None:
    """Apply edit settings change."""
    test_payload = load_test_payload(test_id)

    if "title" in payload:
        test_payload["title"] = payload["title"]

    save_test_payload(test_id, test_payload)
