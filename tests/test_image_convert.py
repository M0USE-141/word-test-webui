from pathlib import Path
from types import SimpleNamespace

import pytest

import image_convert


def test_convert_metafile_to_png_skips_non_metafile(tmp_path: Path) -> None:
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"data")
    assert image_convert.convert_metafile_to_png(image_path, tmp_path) is None


def test_convert_metafile_to_png_uses_external_tool(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    image_path = tmp_path / "diagram.wmf"
    image_path.write_bytes(b"data")

    monkeypatch.setattr(image_convert.os, "name", "posix")
    monkeypatch.setattr(image_convert, "_converter_order", lambda: ("soffice",))
    monkeypatch.setattr(image_convert.shutil, "which", lambda name: "/usr/bin/soffice")

    output_path = tmp_path / "diagram.png"

    def fake_run(command, capture_output, text):
        output_path.write_bytes(b"png")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(image_convert.subprocess, "run", fake_run)

    converted = image_convert.convert_metafile_to_png(image_path, tmp_path)
    assert converted == output_path
    assert output_path.exists()


def test_convert_metafile_to_png_windows_branch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    image_path = tmp_path / "diagram.emf"
    image_path.write_bytes(b"data")

    monkeypatch.setattr(image_convert.os, "name", "nt")

    class DummyImage:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def load(self):
            return None

        def save(self, path, format=None):
            Path(path).write_bytes(b"png")

    monkeypatch.setattr(image_convert, "Image", SimpleNamespace(open=lambda _: DummyImage()))

    converted = image_convert.convert_metafile_to_png(image_path, tmp_path)
    assert converted == tmp_path / "diagram.png"
    assert converted.exists()
