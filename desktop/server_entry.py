import argparse
import os
from pathlib import Path

import uvicorn


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BSU Test Master server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data-dir", default="data/tests")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data_dir = Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("TEST_DATA_DIR", str(data_dir))

    uvicorn.run(
        "api:app",
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
