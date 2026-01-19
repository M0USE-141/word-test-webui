"""Image processing service for user avatars."""
import logging
import os
import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status

from api.config import (
    AVATAR_ALLOWED_EXTENSIONS,
    AVATAR_MAX_DIMENSION,
    AVATAR_MAX_SIZE_BYTES,
    AVATARS_DIR,
)

logger = logging.getLogger(__name__)

# Try to import PIL for image processing
try:
    from PIL import Image

    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("PIL not available, avatar resizing will be skipped")


def validate_avatar_file(file: UploadFile) -> None:
    """
    Validate uploaded avatar file.

    Args:
        file: Uploaded file

    Raises:
        HTTPException: If file is invalid
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )

    # Check extension
    ext = Path(file.filename).suffix.lower()
    if ext not in AVATAR_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(AVATAR_ALLOWED_EXTENSIONS)}",
        )

    # Check content type
    allowed_content_types = {"image/png", "image/jpeg", "image/gif"}
    if file.content_type and file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid content type: {file.content_type}",
        )


def _get_file_size(file: BinaryIO) -> int:
    """Get file size by seeking to end."""
    file.seek(0, 2)  # Seek to end
    size = file.tell()
    file.seek(0)  # Reset to beginning
    return size


def _resize_image(image_path: Path) -> None:
    """
    Resize image to fit within max dimensions.

    Args:
        image_path: Path to the image file
    """
    if not PIL_AVAILABLE:
        return

    try:
        with Image.open(image_path) as img:
            # Convert to RGB if necessary (for PNG with transparency)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # Check if resize is needed
            width, height = img.size
            if width <= AVATAR_MAX_DIMENSION and height <= AVATAR_MAX_DIMENSION:
                return

            # Calculate new size maintaining aspect ratio
            ratio = min(AVATAR_MAX_DIMENSION / width, AVATAR_MAX_DIMENSION / height)
            new_size = (int(width * ratio), int(height * ratio))

            # Resize with high quality
            img = img.resize(new_size, Image.Resampling.LANCZOS)

            # Save with optimization
            img.save(image_path, optimize=True, quality=85)
            logger.info(f"Resized avatar from {width}x{height} to {new_size}")

    except Exception as e:
        logger.error(f"Error resizing image: {e}")
        # Don't raise - keep original image if resize fails


async def process_avatar(file: UploadFile, user_id: int) -> tuple[str, int]:
    """
    Process and save uploaded avatar.

    Args:
        file: Uploaded file
        user_id: User ID for organizing files

    Returns:
        Tuple of (avatar_path, avatar_size)

    Raises:
        HTTPException: If processing fails
    """
    validate_avatar_file(file)

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Check size
    if file_size > AVATAR_MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {AVATAR_MAX_SIZE_BYTES // (1024 * 1024)}MB",
        )

    # Generate unique filename
    ext = Path(file.filename).suffix.lower()
    filename = f"{user_id}_{uuid.uuid4().hex[:8]}{ext}"
    avatar_path = AVATARS_DIR / filename

    # Ensure directory exists
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)

    # Save file
    try:
        with open(avatar_path, "wb") as f:
            f.write(content)

        # Resize if needed
        _resize_image(avatar_path)

        # Get final file size after resize
        final_size = avatar_path.stat().st_size

        logger.info(f"Saved avatar for user {user_id}: {filename}")
        return filename, final_size

    except Exception as e:
        # Clean up on error
        if avatar_path.exists():
            avatar_path.unlink()
        logger.error(f"Error saving avatar: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save avatar",
        )


def delete_avatar(avatar_path: str | None) -> bool:
    """
    Delete avatar file.

    Args:
        avatar_path: Path to avatar file (relative to AVATARS_DIR)

    Returns:
        True if deleted, False if not found
    """
    if not avatar_path:
        return False

    full_path = AVATARS_DIR / avatar_path
    if full_path.exists():
        try:
            full_path.unlink()
            logger.info(f"Deleted avatar: {avatar_path}")
            return True
        except Exception as e:
            logger.error(f"Error deleting avatar {avatar_path}: {e}")
            return False
    return False


def get_avatar_url(user_id: int, avatar_path: str | None) -> str | None:
    """
    Get public URL for avatar.

    Args:
        user_id: User ID
        avatar_path: Avatar filename

    Returns:
        URL string or None
    """
    if not avatar_path:
        return None
    return f"/api/users/{user_id}/avatar"


def get_avatar_file_path(avatar_path: str | None) -> Path | None:
    """
    Get full filesystem path for avatar.

    Args:
        avatar_path: Avatar filename

    Returns:
        Path object or None
    """
    if not avatar_path:
        return None

    full_path = AVATARS_DIR / avatar_path
    if full_path.exists():
        return full_path
    return None
