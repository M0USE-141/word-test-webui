from __future__ import annotations

import logging
import os
from pathlib import Path

from PIL import Image, UnidentifiedImageError

log = logging.getLogger(__name__)


def convert_metafile_to_png(image_path: Path, out_dir: Path) -> Path | None:
    """
    Attempt WMF/EMF -> PNG conversion using Pillow on Windows.
    Returns the converted PNG path, or None if conversion is unavailable.
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    suffix = image_path.suffix.lower()
    if suffix not in {".wmf", ".emf"}:
        return None
    if os.name != "nt":
        log.info("Metafile conversion is supported on Windows only for %s", image_path.name)
        return None

    output_path = out_dir / f"{image_path.stem}.png"
    try:
        with Image.open(image_path) as img:
            img.load()
            img.save(output_path, format="PNG")
    except (UnidentifiedImageError, OSError) as exc:
        log.warning("Failed to convert metafile %s to PNG: %s", image_path.name, exc)
        return None

    log.info("Converted metafile %s to %s", image_path.name, output_path.name)
    return output_path
