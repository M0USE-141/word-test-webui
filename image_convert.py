from __future__ import annotations
import logging
import shutil
import subprocess
from pathlib import Path

from word_extract import find_soffice

log = logging.getLogger(__name__)


def convert_metafile_to_png(image_path: Path, out_dir: Path) -> Path | None:
    """
    Converts WMF/EMF to PNG using LibreOffice or Inkscape.
    Returns PNG path or None on failure.
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    suffix = image_path.suffix.lower()
    if suffix not in {".wmf", ".emf"}:
        return None

    target = out_dir / f"{image_path.stem}.png"
    if target.exists() and target.stat().st_mtime >= image_path.stat().st_mtime:
        log.debug("WMF/EMF cached -> %s", target)
        return target

    # 1) LibreOffice
    soffice_path = find_soffice()
    if soffice_path:
        log.debug("Converting via LibreOffice: %s", image_path)
        r = subprocess.run(
            [soffice_path, "--headless", "--convert-to", "png", "--outdir", str(out_dir), str(image_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode == 0 and target.exists():
            log.info("Converted (LibreOffice) %s -> %s", image_path.name, target.name)
            return target
        log.debug("LibreOffice failed rc=%s stderr=%s", r.returncode, (r.stderr or "").strip())

    # 2) Inkscape fallback
    inkscape = shutil.which("inkscape") or shutil.which("inkscape.exe")
    if inkscape:
        log.debug("Converting via Inkscape: %s", image_path)
        r = subprocess.run(
            [inkscape, str(image_path), "--export-type=png", f"--export-filename={target}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode == 0 and target.exists():
            log.info("Converted (Inkscape) %s -> %s", image_path.name, target.name)
            return target
        log.debug("Inkscape failed rc=%s stderr=%s", r.returncode, (r.stderr or "").strip())

    log.warning("Failed to convert metafile to png: %s", image_path)
    return None
