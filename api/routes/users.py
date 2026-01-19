"""User profile routes."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.auth import (
    AvatarUploadResponse,
    MessageResponse,
    ProfileResponse,
    ProfileUpdateRequest,
)
from api.models.db.user import User
from api.services.auth_service import get_user_by_id
from api.services.image_service import (
    delete_avatar,
    get_avatar_file_path,
    get_avatar_url,
    process_avatar,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_to_profile_response(user: User) -> ProfileResponse:
    """Convert User model to ProfileResponse."""
    return ProfileResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=get_avatar_url(user.id, user.avatar_path),
        avatar_size=user.avatar_size,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("/me/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: Annotated[User, Depends(get_current_user)],
) -> ProfileResponse:
    """Get current user's profile."""
    return _user_to_profile_response(current_user)


@router.patch("/me/profile", response_model=ProfileResponse)
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> ProfileResponse:
    """Update current user's profile."""
    # Update display_name if provided
    if data.display_name is not None:
        # Allow setting to empty string to clear, or a valid name
        current_user.display_name = data.display_name if data.display_name else None

    db.commit()
    db.refresh(current_user)

    return _user_to_profile_response(current_user)


@router.post("/me/avatar", response_model=AvatarUploadResponse)
async def upload_avatar(
    file: UploadFile,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> AvatarUploadResponse:
    """Upload user avatar."""
    # Delete old avatar if exists
    if current_user.avatar_path:
        delete_avatar(current_user.avatar_path)

    # Process and save new avatar
    avatar_path, avatar_size = await process_avatar(file, current_user.id)

    # Update user record
    current_user.avatar_path = avatar_path
    current_user.avatar_size = avatar_size
    db.commit()
    db.refresh(current_user)

    avatar_url = get_avatar_url(current_user.id, avatar_path)
    return AvatarUploadResponse(
        avatar_url=avatar_url,
        avatar_size=avatar_size,
    )


@router.delete("/me/avatar", response_model=MessageResponse)
async def delete_user_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> MessageResponse:
    """Delete user avatar."""
    if not current_user.avatar_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No avatar to delete",
        )

    # Delete file
    delete_avatar(current_user.avatar_path)

    # Update user record
    current_user.avatar_path = None
    current_user.avatar_size = None
    db.commit()

    return MessageResponse(message="Avatar deleted successfully")


@router.get("/{user_id}/avatar")
async def get_user_avatar(
    user_id: int,
    db: Annotated[DbSession, Depends(get_db)],
) -> FileResponse:
    """Get user avatar file (public endpoint)."""
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    avatar_path = get_avatar_file_path(user.avatar_path)
    if avatar_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avatar not found",
        )

    # Determine media type from extension
    ext = avatar_path.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
    }
    media_type = media_types.get(ext, "image/jpeg")

    return FileResponse(
        path=avatar_path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
