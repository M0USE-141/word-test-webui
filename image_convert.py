from __future__ import annotations

import requests
import logging
import os
import time
from pathlib import Path

from PIL import Image, UnidentifiedImageError

log = logging.getLogger(__name__)


METAFILE_EXTENSIONS = {".wmf", ".emf"}


def _convert_with_pillow(image_path: Path, output_path: Path) -> Path | None:
    try:
        with Image.open(image_path) as img:
            img.load()
            img.save(output_path, format="PNG")
    except (UnidentifiedImageError, OSError) as exc:
        log.warning("Failed to convert metafile %s to PNG: %s", image_path.name, exc)
        return None
    return output_path


def _convert_with_cloudconvert(image_path: Path, out_dir: Path) -> Path | None:
    api_key = os.environ.get("CLOUDCONVERT_API_KEY")
    if not api_key:
        log.info("CloudConvert API key is missing; skipping metafile conversion")
        return None

    output_path = out_dir / f"{image_path.stem}.png"
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {api_key}"})

    job_response = session.post(
        "https://api.cloudconvert.com/v2/jobs",
        json={
            "tasks": {
                "import-upload": {"operation": "import/upload"},
                "convert": {
                    "operation": "convert",
                    "input": "import-upload",
                    "input_format": image_path.suffix.lstrip("."),
                    "output_format": "png",
                },
                "export-url": {"operation": "export/url", "input": "convert"},
            }
        },
        timeout=30,
    )
    job_response.raise_for_status()
    job_data = job_response.json().get("data", {})
    job_id = job_data.get("id")
    tasks = job_data.get("tasks", [])
    upload_task = next((task for task in tasks if task.get("name") == "import-upload"), None)
    form = upload_task.get("result", {}).get("form") if upload_task else None
    if not job_id or not form:
        log.warning("CloudConvert job creation response missing upload form")
        return None

    upload_response = session.post(
        form["url"],
        data=form["parameters"],
        files={"file": image_path.read_bytes()},
        timeout=60,
    )
    upload_response.raise_for_status()

    export_url = None
    for _ in range(6):
        status_response = session.get(
            f"https://api.cloudconvert.com/v2/jobs/{job_id}", timeout=30
        )
        status_response.raise_for_status()
        status_data = status_response.json().get("data", {})
        status_tasks = status_data.get("tasks", [])
        export_task = next((task for task in status_tasks if task.get("name") == "export-url"), None)
        files = export_task.get("result", {}).get("files") if export_task else None
        if files:
            export_url = files[0].get("url")
            break
        time.sleep(1)

    if not export_url:
        log.warning("CloudConvert did not return export URL for %s", image_path.name)
        return None

    download_response = session.get(export_url, timeout=60)
    download_response.raise_for_status()
    output_path.write_bytes(download_response.content)
    log.info("Converted metafile %s to %s via CloudConvert", image_path.name, output_path.name)
    return output_path


def convert_metafile_to_png(image_path: Path, out_dir: Path) -> Path | None:
    """
    Attempt WMF/EMF -> PNG conversion.
    Returns the converted PNG path, or None if conversion is unavailable.
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    suffix = image_path.suffix.lower()
    if suffix not in METAFILE_EXTENSIONS:
        return None

    output_path = out_dir / f"{image_path.stem}.png"

    if os.name == "nt":
        converted = _convert_with_pillow(image_path, output_path)
        if converted:
            log.info("Converted metafile %s to %s", image_path.name, output_path.name)
        return converted

    converted = _convert_with_cloudconvert(image_path, out_dir)
    if not converted:
        log.info("Metafile conversion unavailable for %s", image_path.name)
    return converted
