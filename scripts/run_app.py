import os
import socket
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

from main import app


def wait_for_server(host, port, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def open_browser():
    if wait_for_server("127.0.0.1", 8000):
        webbrowser.open("http://127.0.0.1:8000")


def _default_data_dir() -> Path:
    base = os.environ.get("TEST_DATA_DIR")

    if base:
        return Path(base)

    if os.name == "nt":
        root = Path(os.environ.get("APPDATA", Path.home() / "AppData/Roaming"))
    else:
        root = Path.home() / ".local" / "share"

    return root / "MyApp" / "data" / "tests"


def main():
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )


if __name__ == "__main__":
    main()
