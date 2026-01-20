"""Access control API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.access import (
    AccessLevel,
    AccessUpdateRequest,
    ShareRequest,
    ShareResponse,
    TestAccessInfo,
)
from api.models.db.user import User
from api.services import access_service

router = APIRouter(prefix="/api", tags=["access"])


def get_user_by_username(db: DbSession, username: str) -> User | None:
    """Find user by username (case-insensitive) or display_name."""
    from sqlalchemy import select, func

    # Try exact username match first (case-insensitive)
    stmt = select(User).where(func.lower(User.username) == func.lower(username))
    user = db.execute(stmt).scalar_one_or_none()
    if user:
        return user

    # Try display_name match (case-insensitive)
    stmt = select(User).where(func.lower(User.display_name) == func.lower(username))
    return db.execute(stmt).scalar_one_or_none()


@router.get("/tests/{test_id}/access", response_model=TestAccessInfo)
def get_test_access(
    test_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> TestAccessInfo:
    """Get access settings for a test."""
    collection = access_service.get_test_collection_with_owner(db, test_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Test not found or no access control set")

    # Check if user can view this test's access info
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    shares = access_service.list_shares(db, test_id)

    return TestAccessInfo(
        owner_id=collection.owner_id,
        owner_username=collection.owner.username,
        access_level=AccessLevel(collection.access_level),
        is_owner=collection.owner_id == current_user.id,
        shares_count=len(shares),
    )


@router.patch("/tests/{test_id}/access", response_model=TestAccessInfo)
def update_test_access(
    test_id: str,
    payload: AccessUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> TestAccessInfo:
    """Update access level for a test (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can change access level")

    collection = access_service.update_access_level(db, test_id, payload.access_level)
    if not collection:
        raise HTTPException(status_code=404, detail="Test not found")

    # Reload with owner
    collection = access_service.get_test_collection_with_owner(db, test_id)
    shares = access_service.list_shares(db, test_id)

    return TestAccessInfo(
        owner_id=collection.owner_id,
        owner_username=collection.owner.username,
        access_level=AccessLevel(collection.access_level),
        is_owner=True,
        shares_count=len(shares),
    )


@router.get("/tests/{test_id}/shares", response_model=list[ShareResponse])
def list_test_shares(
    test_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> list[ShareResponse]:
    """List users with shared access (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view shares")

    shares = access_service.list_shares(db, test_id)

    return [
        ShareResponse(
            id=share.id,
            user_id=share.user_id,
            username=share.user.username,
            email=share.user.email,
            shared_at=share.shared_at,
            shared_by_username=share.shared_by_user.username if share.shared_by_user else None,
        )
        for share in shares
    ]


@router.post("/tests/{test_id}/shares", response_model=ShareResponse)
def add_test_share(
    test_id: str,
    payload: ShareRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> ShareResponse:
    """Add user to shared access (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can add shares")

    # Check test is in SHARED mode
    collection = access_service.get_test_collection(db, test_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Test not found")

    if collection.access_level != AccessLevel.SHARED.value:
        raise HTTPException(
            status_code=400,
            detail="Test must be in SHARED access level to add shares",
        )

    # Find user to share with
    target_user = get_user_by_username(db, payload.username)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    share = access_service.add_share(db, test_id, target_user.id, current_user.id)
    if not share:
        raise HTTPException(status_code=500, detail="Failed to create share")

    # Reload to get relationships
    shares = access_service.list_shares(db, test_id)
    for s in shares:
        if s.id == share.id:
            return ShareResponse(
                id=s.id,
                user_id=s.user_id,
                username=s.user.username,
                email=s.user.email,
                shared_at=s.shared_at,
                shared_by_username=s.shared_by_user.username if s.shared_by_user else None,
            )

    raise HTTPException(status_code=500, detail="Share created but not found")


@router.delete("/tests/{test_id}/shares/{user_id}")
def remove_test_share(
    test_id: str,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    """Remove user from shared access (owner only)."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can remove shares")

    success = access_service.remove_share(db, test_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Share not found")

    return {"message": "Share removed"}
