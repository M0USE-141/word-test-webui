from __future__ import annotations
import logging


def setup_console_logging(level: int = logging.DEBUG) -> None:
    """
    Call once at app start. Prints detailed logs to console.
    """
    root = logging.getLogger()
    if root.handlers:
        # already configured (avoid duplicates)
        root.setLevel(level)
        return

    root.setLevel(level)
    h = logging.StreamHandler()
    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    h.setFormatter(fmt)
    root.addHandler(h)
