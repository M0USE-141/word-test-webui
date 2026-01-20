"""Statistics endpoints using SQLite database."""
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services import access_service
from api.services.stats_service import (
    get_attempt_stats,
    get_attempts_list,
    get_aggregate_stats,
    get_test_owner_stats,
)
from api.utils import validate_id, validate_test_exists


router = APIRouter(prefix="/api", tags=["statistics"])


def parse_date(date_str: str | None) -> datetime | None:
    """Parse ISO date string to datetime."""
    if not date_str:
        return None
    try:
        # Handle both full ISO and date-only formats
        if "T" in date_str:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return datetime.fromisoformat(date_str + "T00:00:00")
    except ValueError:
        return None


@router.get("/stats/attempts")
def list_attempt_stats(
    db: Annotated[DbSession, Depends(get_db)],
    client_id: str = Query(..., alias="clientId"),
    test_id: str | None = Query(None, alias="testId"),
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """
    List all attempts for a client with optional filters.

    Args:
        client_id: The client ID to filter by (required)
        test_id: Optional test ID to filter by
        start_date: Optional start date filter (ISO format)
        end_date: Optional end date filter (ISO format)
        status: Optional status filter (in_progress, completed, abandoned)
        limit: Maximum number of results (default 100)
        offset: Number of results to skip (for pagination)

    Returns:
        Dictionary with attempts list and pagination info
    """
    client_id = validate_id("clientId", client_id)
    if test_id:
        test_id = validate_id("testId", test_id)

    attempts, total = get_attempts_list(
        db=db,
        client_id=client_id,
        test_id=test_id,
        status=status,
        start_date=parse_date(start_date),
        end_date=parse_date(end_date),
        limit=limit,
        offset=offset,
    )

    return {
        "attempts": attempts,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/stats/attempts/{attempt_id}")
def get_single_attempt_stats(
    attempt_id: str,
    db: Annotated[DbSession, Depends(get_db)],
    client_id: str = Query(..., alias="clientId"),
) -> dict[str, Any]:
    """
    Get detailed statistics for a single attempt.

    Returns full attempt data including per-question breakdown with
    question snapshots for preview.
    """
    attempt_id = validate_id("attemptId", attempt_id)
    client_id = validate_id("clientId", client_id)

    stats = get_attempt_stats(db, attempt_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Verify client owns this attempt
    if stats.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return stats


@router.get("/stats/aggregate")
def get_aggregate_statistics(
    db: Annotated[DbSession, Depends(get_db)],
    client_id: str = Query(..., alias="clientId"),
    test_id: str | None = Query(None, alias="testId"),
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
) -> dict[str, Any]:
    """
    Get aggregate statistics across multiple attempts.

    Useful for showing overall progress and trends.
    """
    client_id = validate_id("clientId", client_id)
    if test_id:
        test_id = validate_id("testId", test_id)

    return get_aggregate_stats(
        db=db,
        client_id=client_id,
        test_id=test_id,
        start_date=parse_date(start_date),
        end_date=parse_date(end_date),
    )


@router.get("/tests/{test_id}/statistics")
def get_test_statistics(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """
    Get statistics for a test (owner only).

    Returns aggregated statistics for all attempts on this test,
    including per-user breakdown.
    """
    test_id = validate_id("testId", test_id)
    validate_test_exists(test_id)

    # Check if user is owner
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view test statistics")

    return get_test_owner_stats(
        db=db,
        test_id=test_id,
        start_date=parse_date(start_date),
        end_date=parse_date(end_date),
        limit=limit,
        offset=offset,
    )
