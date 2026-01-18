"""Asset management endpoints."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from api.utils import assets_dir, save_upload_file, safe_asset_path, test_dir

router = APIRouter(prefix="/api/tests/{test_id}/assets", tags=["assets"])


@router.get("/{asset_path:path}")
def get_asset(test_id: str, asset_path: str) -> FileResponse:
    """Get test asset file."""
    assets_directory = assets_dir(test_id)
    file_path = safe_asset_path(assets_directory, asset_path)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(file_path)


@router.post("")
def upload_asset(test_id: str, file: UploadFile = File(...)) -> dict[str, str]:
    """Upload asset to test."""
    assets_directory = assets_dir(test_id)
    if not test_dir(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")

    saved_path = save_upload_file(file, assets_directory)

    return {
        "src": saved_path.relative_to(assets_directory).as_posix(),
        "name": saved_path.name,
        "id": saved_path.stem,
    }
