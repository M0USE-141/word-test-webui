"""JSON serialization utilities."""
import json
from pathlib import Path


def json_dump(payload: object) -> str:
    """Serialize object to pretty JSON string."""
    return json.dumps(payload, ensure_ascii=False, indent=2)


def ndjson_dump(payload: object) -> str:
    """Serialize object to compact JSON string (for NDJSON)."""
    return json.dumps(payload, ensure_ascii=False)


def json_load(data: str) -> object:
    """Deserialize JSON string to object."""
    return json.loads(data)


def read_json_file(path: Path, default: object) -> object:
    """Read and parse JSON file, return default if not exists."""
    if not path.exists():
        return default
    return json_load(path.read_text(encoding="utf-8"))


def write_json_file(path: Path, payload: object) -> None:
    """Write object as JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_dump(payload), encoding="utf-8")