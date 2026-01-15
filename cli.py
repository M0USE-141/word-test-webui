import argparse
import uuid
from pathlib import Path

from logging_setup import setup_console_logging
from serialization import serialize_test_payload
from word_extract import WordTestExtractor

setup_console_logging()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract tests from Word files")
    parser.add_argument("file", type=Path, help="Path to .doc or .docx file")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/tests"),
        help="Output directory for extracted tests",
    )
    parser.add_argument(
        "--symbol",
        type=str,
        default="*",
        help="Correct answer marker symbol",
    )
    parser.add_argument(
        "--log-small-tables",
        action="store_true",
        help="Log tables with fewer than 3 rows",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    test_id = uuid.uuid4().hex
    test_dir = args.output / test_id
    assets_dir = test_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    extractor = WordTestExtractor(
        args.file,
        args.symbol,
        args.log_small_tables,
        assets_dir,
    )
    try:
        tests = extractor.extract()
        payload = serialize_test_payload(test_id, args.file.stem, tests, assets_dir)
        (test_dir / "test.json").write_text(
            json_dump(payload), encoding="utf-8"
        )
    finally:
        extractor.cleanup()

    print(f"Saved test to {test_dir}")


def json_dump(payload: dict[str, object]) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
