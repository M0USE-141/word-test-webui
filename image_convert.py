from __future__ import annotations
import logging
from pathlib import Path

log = logging.getLogger(__name__)


def convert_metafile_to_png(image_path: Path, out_dir: Path) -> Path | None:
    """
    Deprecated: WMF/EMF conversion is disabled.
    Returns None to indicate no conversion was performed.
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    suffix = image_path.suffix.lower()
    if suffix not in {".wmf", ".emf"}:
        return None
    log.info("WMF/EMF conversion disabled for %s", image_path.name)
    return None
