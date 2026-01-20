"""Change request API routes."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.change_request import (
    CanProposeResponse,
    ChangeRequestCreate,
    ChangeRequestListResponse,
    ChangeRequestResponse,
    ChangeRequestReview,
    ChangeRequestStats,
    ChangeRequestStatus,
    ChangeRequestType,
)
from api.models.db.user import User
from api.services import access_service, change_request_service

router = APIRouter(prefix="/api", tags=["change-requests"])


def _to_response(cr) -> ChangeRequestResponse:
    """Convert ChangeRequest to response model."""
    return ChangeRequestResponse(
        id=cr.id,
        test_id=cr.test_collection.test_id,
        user_id=cr.user_id,
        username=cr.user.username,
        request_type=ChangeRequestType(cr.request_type),
        question_id=cr.question_id,
        payload=json.loads(cr.payload),
        status=ChangeRequestStatus(cr.status),
        created_at=cr.created_at,
        reviewed_at=cr.reviewed_at,
        reviewed_by=cr.reviewed_by,
        reviewer_username=cr.reviewer.username if cr.reviewer else None,
        review_comment=cr.review_comment,
    )


@router.get(
    "/tests/{test_id}/change-requests/can-propose",
    response_model=CanProposeResponse,
)
def check_can_propose(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> CanProposeResponse:
    """Check if current user can propose changes to a test."""
    can_propose, is_owner, reason = change_request_service.can_create_change_request(
        db, test_id, current_user
    )
    return CanProposeResponse(
        can_propose=can_propose,
        is_owner=is_owner,
        reason=reason,
    )


@router.post(
    "/tests/{test_id}/change-requests",
    response_model=ChangeRequestResponse,
)
def create_change_request(
    test_id: str,
    payload: ChangeRequestCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> ChangeRequestResponse:
    """Create a new change request."""
    can_propose, is_owner, reason = change_request_service.can_create_change_request(
        db, test_id, current_user
    )

    if is_owner:
        raise HTTPException(
            status_code=400,
            detail="Owner can edit directly, no need for change request",
        )

    if not can_propose:
        raise HTTPException(status_code=403, detail=reason or "Cannot propose changes")

    try:
        cr = change_request_service.create_change_request(
            db=db,
            test_id=test_id,
            user=current_user,
            request_type=payload.request_type,
            payload=payload.payload,
            question_id=payload.question_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Reload with relationships
    cr = change_request_service.get_change_request(db, cr.id)
    return _to_response(cr)


@router.get(
    "/tests/{test_id}/change-requests",
    response_model=ChangeRequestListResponse,
)
def list_change_requests(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    status: ChangeRequestStatus | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> ChangeRequestListResponse:
    """List change requests for a test (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only owner can view change requests",
        )

    items, total, pending_count = change_request_service.list_change_requests(
        db, test_id, status, limit, offset
    )

    return ChangeRequestListResponse(
        items=[_to_response(cr) for cr in items],
        total=total,
        pending_count=pending_count,
    )


@router.get(
    "/tests/{test_id}/change-requests/stats",
    response_model=ChangeRequestStats,
)
def get_change_request_stats(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> ChangeRequestStats:
    """Get statistics for change requests (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only owner can view change request stats",
        )

    stats = change_request_service.get_change_request_stats(db, test_id)
    return ChangeRequestStats(**stats)


@router.post(
    "/tests/{test_id}/change-requests/{request_id}/approve",
    response_model=ChangeRequestResponse,
)
def approve_change_request(
    test_id: str,
    request_id: int,
    payload: ChangeRequestReview,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> ChangeRequestResponse:
    """Approve a change request and apply changes (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only owner can approve change requests",
        )

    # Verify the request belongs to this test
    cr = change_request_service.get_change_request(db, request_id)
    if not cr or cr.test_collection.test_id != test_id:
        raise HTTPException(status_code=404, detail="Change request not found")

    try:
        cr = change_request_service.approve_change_request(
            db, request_id, current_user, payload.comment
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _to_response(cr)


@router.post(
    "/tests/{test_id}/change-requests/{request_id}/reject",
    response_model=ChangeRequestResponse,
)
def reject_change_request(
    test_id: str,
    request_id: int,
    payload: ChangeRequestReview,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> ChangeRequestResponse:
    """Reject a change request (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only owner can reject change requests",
        )

    # Verify the request belongs to this test
    cr = change_request_service.get_change_request(db, request_id)
    if not cr or cr.test_collection.test_id != test_id:
        raise HTTPException(status_code=404, detail="Change request not found")

    try:
        cr = change_request_service.reject_change_request(
            db, request_id, current_user, payload.comment
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _to_response(cr)
