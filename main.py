import os
from pathlib import Path

import uvicorn

from api import app


def _default_data_dir() -> Path:
    return Path(os.environ.get("TEST_DATA_DIR", Path.cwd() / "data" / "tests"))


if __name__ == "__main__":
    os.environ.setdefault("TEST_DATA_DIR", str(_default_data_dir()))
    uvicorn.run(app, host="127.0.0.1", port=8000)
