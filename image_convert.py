from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, UnidentifiedImageError

log = logging.getLogger(__name__)


METAFILE_EXTENSIONS = {".wmf", ".emf"}
DEFAULT_CONVERTERS = ("soffice", "libreoffice", "inkscape", "magick", "convert")


def _converter_order() -> tuple[str, ...]:
    raw = os.environ.get("METAFILE_CONVERTERS")
    if not raw:
        return DEFAULT_CONVERTERS
    return tuple(entry.strip() for entry in raw.split(",") if entry.strip())


def _run_command(command: list[str], output_path: Path) -> bool:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        log.warning(
            "Metafile conversion command failed: %s\nstdout: %s\nstderr: %s",
            " ".join(command),
            result.stdout.strip(),
            result.stderr.strip(),
        )
        return False
    if not output_path.exists():
        log.warning("Metafile conversion command succeeded but output missing: %s", output_path)
        return False
    return True


def _convert_with_pillow(image_path: Path, output_path: Path) -> Path | None:
    try:
        with Image.open(image_path) as img:
            img.load()
            img.save(output_path, format="PNG")
    except (UnidentifiedImageError, OSError) as exc:
        log.warning("Failed to convert metafile %s to PNG: %s", image_path.name, exc)
        return None
    return output_path


def _convert_with_external_tool(image_path: Path, out_dir: Path) -> Path | None:
    output_path = out_dir / f"{image_path.stem}.png"
    for converter in _converter_order():
        if not shutil.which(converter):
            continue
        if converter in {"soffice", "libreoffice"}:
            command = [
                converter,
                "--headless",
                "--convert-to",
                "png",
                "--outdir",
                str(out_dir),
                str(image_path),
            ]
        elif converter == "inkscape":
            command = [
                converter,
                str(image_path),
                "--export-type=png",
                f"--export-filename={output_path}",
            ]
        else:
            command = [converter, str(image_path), str(output_path)]

        log.info("Attempting metafile conversion with %s", converter)
        if _run_command(command, output_path):
            log.info("Converted metafile %s to %s", image_path.name, output_path.name)
            return output_path
    return None


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

    converted = _convert_with_external_tool(image_path, out_dir)
    if not converted:
        log.info("Metafile conversion unavailable for %s", image_path.name)
    return converted
