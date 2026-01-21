from pathlib import Path
from types import SimpleNamespace

import pytest

import image_convert


def test_convert_metafile_to_png_skips_non_metafile(tmp_path: Path) -> None:
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"data")
    assert image_convert.convert_metafile_to_png(image_path, tmp_path) is None


def test_convert_metafile_to_png_uses_cloudconvert(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    image_path = tmp_path / "diagram.wmf"
    image_path.write_bytes(b"data")

    monkeypatch.setattr(image_convert.os, "name", "posix")
    monkeypatch.setenv("CLOUDCONVERT_API_KEY", "test-key")

    output_path = tmp_path / "diagram.png"

    class FakeResponse:
        def __init__(self, payload=None, content=b""):
            self._payload = payload or {}
            self.content = content

        def raise_for_status(self) -> None:
            return None

        def json(self):
            return self._payload

    class FakeSession:
        def __init__(self):
            self.headers = {}
            self.calls = []

        def post(self, url, json=None, data=None, files=None, timeout=None):
            self.calls.append(("post", url))
            if url.endswith("/jobs"):
                return FakeResponse(
                    {
                        "data": {
                            "id": "job-1",
                            "tasks": [
                                {
                                    "name": "import-upload",
                                    "result": {
                                        "form": {
                                            "url": "https://upload.example.com",
                                            "parameters": {"key": "value"},
                                        }
                                    },
                                }
                            ],
                        }
                    }
                )
            return FakeResponse()

        def get(self, url, timeout=None):
            self.calls.append(("get", url))
            if url.endswith("/jobs/job-1"):
                return FakeResponse(
                    {
                        "data": {
                            "tasks": [
                                {
                                    "name": "export-url",
                                    "result": {"files": [{"url": "https://download.example.com/file.png"}]},
                                }
                            ]
                        }
                    }
                )
            return FakeResponse(content=b"png")

    monkeypatch.setattr(image_convert.requests, "Session", FakeSession)
    monkeypatch.setattr(image_convert.time, "sleep", lambda _: None)

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
