from __future__ import annotations

import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


def _is_windows() -> bool:
    return os.name == "nt"


class WordFormulaRenderer:
    """
    Robust Word COM renderer with true resume:
    - Uses doc.OMaths(i) index iteration (no COM enumerator)
    - Skips already rendered files (resume across runs)
    - Restarts Word proactively and on crash (RPC unavailable)
    """

    def __init__(
        self,
        out_dir: Path,
        fmt: str = "emf",
        restart_every: int = 40,
        max_retries: int = 5,
        delay_on_fail_sec: float = 1.0,
    ):
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.fmt = fmt.lower()  # "emf" | "wmf"
        self.restart_every = max(10, int(restart_every))
        self.max_retries = max(0, int(max_retries))
        self.delay_on_fail_sec = float(delay_on_fail_sec)

    def available(self) -> bool:
        if not _is_windows():
            return False
        try:
            import win32com.client  # noqa
            import pythoncom  # noqa
            return True
        except Exception:
            return False

    def render_all(self, docx_path: Path) -> list[Path]:
        """
        Returns list of rendered formula images.
        Resume works: already existing omml_*.{fmt} are skipped.
        """
        if not self.available():
            log.info("Word COM not available -> formula rendering skipped.")
            return []

        local_copy = self._make_local_copy(docx_path)

        # 1) OMML formulas with resume
        omml = self._render_omml_resume(local_copy)

        # 2) Old OLE equations (optional; can be slow)
        ole = self._render_ole_equations(local_copy, start_index=self._last_done_index("omml_") + 1)

        out = [*omml, *ole]
        out = [p for p in out if p.exists() and p.stat().st_size > 0]
        log.info("Word rendering finished. Total formula images: %d", len(out))
        return out

    # ---------------- helpers ----------------

    def _make_local_copy(self, docx_path: Path) -> Path:
        docx_path = Path(docx_path).resolve()
        tmp_dir = Path(tempfile.mkdtemp(prefix="word_formula_src_"))
        dst = tmp_dir / docx_path.name
        shutil.copy2(docx_path, dst)
        log.info("Using local copy for Word rendering: %s", dst)
        return dst

    def _render_omml_resume(self, docx_local_path: Path) -> list[Path]:
        import pythoncom
        import win32com.client

        start_i = max(1, self._last_done_index("omml_") + 1)
        retries_left = self.max_retries

        while True:
            pythoncom.CoInitialize()
            word_app = None
            doc = None
            tmp_doc = None

            try:
                word_app = win32com.client.DispatchEx("Word.Application")
                word_app.Visible = False
                word_app.DisplayAlerts = 0

                try:
                    word_app.Options.CheckSpellingAsYouType = False
                    word_app.Options.CheckGrammarAsYouType = False
                except Exception:
                    pass

                doc = word_app.Documents.Open(str(Path(docx_local_path).resolve()))
                tmp_doc = word_app.Documents.Add()
                total = int(doc.OMaths.Count)
                log.info("OMML total=%d, resume from=%d", total, start_i)

                for i in range(start_i, total + 1):
                    out_path = self.out_dir / f"omml_{i:06d}.{self.fmt}"
                    if out_path.exists() and out_path.stat().st_size > 0:
                        continue

                    om = doc.OMaths(i)

                    # force “visual build”
                    try:
                        om.BuildUp()
                    except Exception:
                        pass

                    ok = self._save_range_as_picture(tmp_doc, om.Range, out_path)

                    if i % 25 == 0:
                        log.debug("Rendered OMML %d/%d (ok=%s)", i, total, ok)

                    if self.restart_every and (i % self.restart_every == 0):
                        start_i = i + 1
                        raise RuntimeError("PROACTIVE_RESTART")

                break

            except Exception as e:
                if str(e) == "PROACTIVE_RESTART":
                    log.info("Proactive restart -> continue from %d", start_i)
                else:
                    log.exception("Word crashed during OMML render. Will resume.")
                    start_i = max(start_i, self._last_done_index("omml_") + 1)

                retries_left -= 1
                if retries_left < 0:
                    log.error("No retries left for OMML. Stop at %d", start_i)
                    break
                time.sleep(self.delay_on_fail_sec)

            finally:
                try:
                    if tmp_doc is not None:
                        tmp_doc.Close(False)
                except Exception:
                    pass
                try:
                    if doc is not None:
                        doc.Close(False)
                except Exception:
                    pass
                try:
                    if word_app is not None:
                        word_app.Quit()
                except Exception:
                    pass
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        return sorted([p for p in self.out_dir.glob(f"omml_*.{self.fmt}") if p.stat().st_size > 0])

    def _render_ole_equations(self, docx_local_path: Path, start_index: int) -> list[Path]:
        """
        Render old Equation Editor OLE objects.
        Not resumed by index perfectly (because OLE objects don't have a simple ordered index like OMaths),
        but we skip existing outputs by filename prefix.
        """
        import pythoncom
        import win32com.client

        pythoncom.CoInitialize()
        word_app = None
        doc = None
        tmp_doc = None

        out: list[Path] = []
        idx = start_index - 1

        try:
            word_app = win32com.client.DispatchEx("Word.Application")
            word_app.Visible = False
            word_app.DisplayAlerts = 0

            doc = word_app.Documents.Open(str(Path(docx_local_path).resolve()))
            tmp_doc = word_app.Documents.Add()
            try:
                inline_total = int(doc.InlineShapes.Count)
            except Exception:
                inline_total = 0

            ole_found = 0
            for j in range(1, inline_total + 1):
                ils = doc.InlineShapes(j)
                if not self._looks_like_equation_ole_inline(ils):
                    continue

                ole_found += 1
                idx += 1
                out_path = self.out_dir / f"ole_{idx:06d}.{self.fmt}"

                if out_path.exists() and out_path.stat().st_size > 0:
                    continue

                try:
                    ils.SaveAsPicture(str(out_path))
                except Exception:
                    self._save_range_as_picture(tmp_doc, ils.Range, out_path)

                if out_path.exists() and out_path.stat().st_size > 0:
                    out.append(out_path)

            log.info("OLE equations rendered: %d", ole_found)
            return out

        except Exception:
            log.exception("OLE render failed (ignored).")
            return out

        finally:
            try:
                if tmp_doc is not None:
                    tmp_doc.Close(False)
            except Exception:
                pass
            try:
                if doc is not None:
                    doc.Close(False)
            except Exception:
                pass
            try:
                if word_app is not None:
                    word_app.Quit()
            except Exception:
                pass
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

    def _save_range_as_picture(self, tmp_doc, rng, out_path: Path) -> bool:
        """
        NO-CLIPBOARD method:
        1) assign tmp.Range.FormattedText = rng.FormattedText
        2) convert tmp content to picture via CopyAsPicture + PasteSpecial inside same doc (minimal clipboard use)
           OR try tmp.InlineShapes.AddOLEControl? (not stable)
        """
        try:
            tmp_doc.Range(0, tmp_doc.Content.End).Delete()

            # вставляем содержимое без Copy/Paste в clipboard
            tmp_rng = tmp_doc.Range(0, 0)
            tmp_rng.FormattedText = rng.FormattedText

            try:
                tmp_doc.OMaths.BuildUp()
            except Exception:
                pass

            app = tmp_doc.Application
            try:
                app.CutCopyMode = 0
            except Exception:
                pass

            for attempt in range(3):
                try:
                    # теперь превращаем в картинку
                    # CopyAsPicture — более “word-native” и обычно стабильнее
                    tmp_rng = tmp_doc.Range(0, tmp_doc.Content.End)
                    tmp_doc.Activate()
                    tmp_rng.Select()
                    app.Selection.CopyAsPicture()

                    # 17 = wdPasteEnhancedMetafile
                    app.Selection.PasteSpecial(DataType=17)

                    if tmp_doc.InlineShapes.Count >= 1:
                        tmp_doc.InlineShapes(1).SaveAsPicture(str(out_path))
                        return out_path.exists() and out_path.stat().st_size > 0
                    return False
                except Exception as e:
                    if attempt == 2:
                        raise
                    log.debug("Copy/paste attempt failed: %s", e)
                    try:
                        app.CutCopyMode = 0
                    except Exception:
                        pass
                    time.sleep(0.2)
            return False
        except Exception as e:
            log.debug("Save as picture failed (no-clipboard path): %s", e)
            return False

    def _looks_like_equation_ole_inline(self, inline_shape) -> bool:
        try:
            # 1 = wdInlineShapeEmbeddedOLEObject
            if inline_shape.Type != 1:
                return False
            try:
                prog = (inline_shape.OLEFormat.ProgID or "").lower()
            except Exception:
                prog = ""
            return any(x in prog for x in ("equation", "eqnedt32", "math"))
        except Exception:
            return False

    def _last_done_index(self, prefix: str) -> int:
        last = 0
        for p in self.out_dir.glob(f"{prefix}*.{self.fmt}"):
            if not p.exists() or p.stat().st_size == 0:
                continue
            try:
                num = int(p.stem.split("_")[-1])
                last = max(last, num)
            except Exception:
                continue
        return last
