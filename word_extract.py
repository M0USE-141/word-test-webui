from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from docx import Document

from models import ContentItem, TestOption, TestQuestion
from word_formula_render import WordFormulaRenderer

log = logging.getLogger(__name__)

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
}


def find_soffice() -> Optional[str]:
    """
    Returns absolute path to soffice(.exe) as string, or None if not found.
    Works around Windows quirks and PathLike issues.
    """
    env = os.environ.get("SOFFICE_PATH")
    if env and Path(env).exists():
        return str(env)

    # 1) Normal PATH lookup (must use str)
    for name in ("soffice", "soffice.exe"):
        p = shutil.which(str(name))
        if p:
            return str(p)

    # 2) Common install locations on Windows
    if os.name == "nt":
        candidates = [
            Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "LibreOffice" / "program" / "soffice.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "LibreOffice" / "program" / "soffice.exe",
            # Microsoft Store / other layouts sometimes:
            Path(os.environ.get("PROGRAMW6432", r"C:\Program Files")) / "LibreOffice" / "program" / "soffice.exe",
        ]
        for c in candidates:
            if c.exists():
                return str(c)

    # 3) macOS typical (if you ever run there)
    if os.name == "posix":
        mac = Path("/Applications/LibreOffice.app/Contents/MacOS/soffice")
        if mac.exists():
            return str(mac)

    return None



class WordTestExtractor:
    def __init__(
            self,
            file_path: Path,
            symbol: str,
            log_small_tables: bool,
            image_output_dir: Path,
            prefer_word_render: bool = True,
            formula_fmt: str = "emf",
    ):
        self.file_path = Path(file_path)
        self.symbol = symbol
        self.log_small_tables = log_small_tables
        self.extract_dir = Path(image_output_dir)
        self.extract_dir.mkdir(parents=True, exist_ok=True)
        self.logs: list[str] = []  # short TK logs
        self.prefer_word_render = prefer_word_render
        self.formula_fmt = formula_fmt

        self._tmp_dirs: list[Path] = []

    def cleanup(self) -> None:
        for d in self._tmp_dirs:
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass

    # ---- DOC -> DOCX via LibreOffice ----
    def _convert_doc_to_docx(self, doc_path: Path) -> Path:
        doc_path = doc_path.resolve()
        if not doc_path.exists():
            raise RuntimeError(f"Файл не найден: {doc_path}")

        converted = doc_path.with_suffix(".docx")
        if converted.exists():
            log.info("DOCX already exists рядом с DOC: %s", converted)
            return converted

        soffice_path = find_soffice()
        if not soffice_path:
            raise RuntimeError(
                "Не удалось найти soffice для конвертации .doc. "
                "Установите LibreOffice и добавьте soffice в PATH."
            )

        temp_out = Path(tempfile.mkdtemp(prefix="word_test_docx_"))
        self._tmp_dirs.append(temp_out)

        log.info("Converting DOC -> DOCX via LibreOffice: %s", doc_path)
        r = subprocess.run(
            [soffice, "--headless", "--convert-to", "docx", "--outdir", str(temp_out), str(doc_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode != 0:
            log.error("LibreOffice convert failed rc=%s stderr=%s", r.returncode, (r.stderr or "").strip())
            raise RuntimeError("Не удалось конвертировать .doc файл. Установите LibreOffice (soffice).")

        candidates = sorted(temp_out.glob("*.docx"), key=lambda p: p.stat().st_mtime)
        if not candidates:
            raise RuntimeError("Конвертация .doc завершилась без результата.")
        log.info("DOC -> DOCX done: %s", candidates[-1])
        return candidates[-1]

    def _load_document(self) -> tuple[Document, Path]:
        if self.file_path.suffix.lower() == ".doc":
            docx = self._convert_doc_to_docx(self.file_path)
            return Document(docx), docx
        return Document(self.file_path), self.file_path

    # ---- Extract embedded images from docx media ----
    def _extract_images(self, doc: Document) -> dict[str, Path]:
        image_map: dict[str, Path] = {}
        count = 0
        for rel_id, part in doc.part.related_parts.items():
            if "image" not in part.content_type:
                continue
            ext = Path(part.partname).suffix
            image_path = self.extract_dir / f"{rel_id}{ext}"
            image_path.write_bytes(part.blob)
            image_map[rel_id] = image_path
            count += 1
        log.info("Extracted embedded images: %d", count)
        self.logs.append(f"Изображений извлечено: {count}")
        return image_map

    # ---- Render formulas through Word (if available) ----
    def _render_formulas(self, docx_path: Path) -> dict[str, Path]:
        if not self.prefer_word_render:
            self.logs.append("Формулы: рендер отключен")
            return {}

        formula_dir = self.extract_dir / "formulas_raw"
        formula_dir.mkdir(parents=True, exist_ok=True)

        renderer = WordFormulaRenderer(
            formula_dir,
            fmt=self.formula_fmt,
            restart_every=40,  # можно 30-50
            max_retries=3,
            delay_on_fail_sec=1.0,
        )

        if not renderer.available():
            self.logs.append("Формулы: Word недоступен, будут плейсхолдеры")
            return {}

        self.logs.append("Формулы: рендер через Word...")
        formula_map: dict[str, Path] = {}
        try:
            formula_map = renderer.render_all(docx_path)
            if formula_map:
                self.logs.append(f"Формулы: сохранено {len(formula_map)} картинок")
            else:
                self.logs.append("Формулы: не удалось сохранить картинки (плейсхолдеры)")
        except Exception as e:
            # даже если упало — у render_all часто уже есть частичный результат, но тут исключение
            self.logs.append(f"Формулы: ошибка рендера ({e})")
        return formula_map

    def _build_formula_id_map(self, doc: Document) -> dict[int, str]:
        formula_map: dict[int, str] = {}
        index = 1
        for element in doc.element.body.iter():
            tag = element.tag
            if tag.endswith("}oMath"):
                formula_map[id(element)] = f"omml_{index:06d}"
                index += 1
        return formula_map

    # ---- Parse cell content (text + images + formulas) ----
    def _content_from_cell(
            self,
            cell,
            image_map: dict[str, Path],
            formula_image_map: dict[str, Path],
            formula_id_map: dict[int, str],
            formula_placeholder: str = "[formula]",
    ) -> list[ContentItem]:
        items: list[ContentItem] = []
        text_buf: list[str] = []

        def flush_text():
            if text_buf:
                items.append(ContentItem("text", "".join(text_buf)))
                text_buf.clear()

        def push_image(p: Path):
            flush_text()
            items.append(ContentItem("image", str(p)))

        def push_formula(formula_id: str | None):
            flush_text()
            image_path = None
            if formula_id:
                image_path = formula_image_map.get(formula_id)
            items.append(
                ContentItem(
                    "formula",
                    formula_id=formula_id,
                    path=str(image_path) if image_path else None,
                )
            )

        # cell children: w:p, w:tbl...
        for block in cell._tc.iterchildren():
            if not block.tag.endswith("}p"):
                continue

            # iterate direct children of paragraph in order (IMPORTANT)
            for child in list(block):
                tag = child.tag

                # OMML formula
                if tag.endswith("}oMath") or tag.endswith("}oMathPara"):
                    formula_id = None
                    if tag.endswith("}oMathPara"):
                        child_omml = child.find(".//m:oMath", namespaces=NS)
                        if child_omml is not None:
                            formula_id = formula_id_map.get(id(child_omml))
                    if formula_id is None:
                        formula_id = formula_id_map.get(id(child))
                    push_formula(formula_id)
                    continue

                # runs/hyperlinks
                if tag.endswith("}r") or tag.endswith("}hyperlink"):
                    # text
                    for t in child.findall(".//w:t", namespaces=NS):
                        if t.text:
                            text_buf.append(t.text)

                    # line breaks
                    for br in child.findall(".//w:br", namespaces=NS):
                        flush_text()
                        items.append(ContentItem("line_break"))

                    for cr in child.findall(".//w:cr", namespaces=NS):
                        flush_text()
                        items.append(ContentItem("line_break"))

                    # DrawingML images
                    for blip in child.findall(".//a:blip", namespaces=NS):
                        rid = blip.get(f"{{{NS['r']}}}embed")
                        if rid and rid in image_map:
                            push_image(image_map[rid])

                    # VML images (old equation previews)
                    for imdata in child.findall(".//v:imagedata", namespaces=NS):
                        rid = imdata.get(f"{{{NS['r']}}}id") or imdata.get(f"{{{NS['r']}}}embed")
                        if rid and rid in image_map:
                            push_image(image_map[rid])
                        else:
                            flush_text()
                            items.append(ContentItem("text", formula_placeholder))

                    # explicit OLE object marker
                    if child.find(".//o:OLEObject", namespaces=NS) is not None:
                        flush_text()
                        items.append(ContentItem("text", formula_placeholder))

            flush_text()
            items.append(ContentItem("paragraph_break"))

        while items and items[-1].item_type in {"paragraph_break", "line_break"}:
            items.pop()

        if not items:
            items.append(ContentItem("text", ""))
        return items

    def _row_has_any_content_fast(self, row) -> bool:
        """
        Fast check without consuming formula iterator.
        """
        for cell in row.cells:
            for block in cell._tc.iterchildren():
                if not block.tag.endswith("}p"):
                    continue
                if block.find(".//w:t", namespaces=NS) is not None:
                    return True
                if block.find(".//a:blip", namespaces=NS) is not None:
                    return True
                if block.find(".//v:imagedata", namespaces=NS) is not None:
                    return True
                if block.find(".//m:oMath", namespaces=NS) is not None:
                    return True
                if block.find(".//m:oMathPara", namespaces=NS) is not None:
                    return True
                if block.find(".//o:OLEObject", namespaces=NS) is not None:
                    return True
        return False

    def extract(self, formula_placeholder: str = "[formula]") -> list[TestQuestion]:
        log.info("=== EXTRACT START: %s ===", self.file_path)
        self.logs.clear()
        self.logs.append(f"Файл: {self.file_path.name}")

        doc, docx_path = self._load_document()
        log.info("Document loaded. Tables: %d", len(doc.tables))

        image_map = self._extract_images(doc)

        formula_image_map = self._render_formulas(docx_path)
        formula_id_map = self._build_formula_id_map(doc)

        tests: list[TestQuestion] = []
        tables_used = 0

        for table_index, table in enumerate(doc.tables, start=1):
            rows = len(table.rows)
            cols = len(table.columns) if table.columns else 0
            log.debug("Table %d: rows=%d cols=%d", table_index, rows, cols)

            if rows < 3:
                if self.log_small_tables:
                    msg = f"Таблица {table_index}: < 3 строк, пропуск"
                    self.logs.append(msg)
                continue

            content_rows = sum(1 for r in table.rows if self._row_has_any_content_fast(r))
            if content_rows < 3:
                if self.log_small_tables:
                    msg = f"Таблица {table_index}: < 3 строк с контентом, пропуск"
                    self.logs.append(msg)
                continue

            tables_used += 1
            row_contents: list[list[ContentItem]] = []

            for r_i, row in enumerate(table.rows):
                row_items: list[ContentItem] = []
                for c_i, cell in enumerate(row.cells):
                    cell_items = self._content_from_cell(
                        cell,
                        image_map,
                        formula_image_map,
                        formula_id_map,
                        formula_placeholder,
                    )
                    row_items.extend(cell_items)
                row_contents.append(row_items)

            if len(row_contents) < 2:
                log.debug("Table %d: <2 content rows after parse, skip", table_index)
                continue

            question = row_contents[0]
            correct_default = row_contents[1]

            options: list[TestOption] = []
            has_marked_correct = False

            def normalize_symbol(option_items: list[ContentItem]) -> bool:
                for item in option_items:
                    if item.item_type != "text":
                        continue
                    s = item.value.lstrip()
                    if self.symbol and s.startswith(self.symbol):
                        item.value = s[len(self.symbol):].lstrip()
                        return True
                return False

            options.append(TestOption(correct_default, False))

            for option_items in row_contents[2:]:
                is_correct = False
                if self.symbol:
                    is_correct = normalize_symbol(option_items)
                    if is_correct:
                        has_marked_correct = True
                options.append(TestOption(option_items, is_correct))

            if self.symbol and normalize_symbol(correct_default):
                has_marked_correct = True
                options[0].is_correct = True

            if not has_marked_correct and options:
                options[0].is_correct = True

            for opt in options:
                if opt.is_correct:
                    correct_default = opt.content
                    break

            tests.append(TestQuestion(question=question, correct=correct_default, options=options))

            if len(tests) % 25 == 0:
                log.info("Extracted questions so far: %d", len(tests))

        log.info("Tables used: %d / %d", tables_used, len(doc.tables))
        log.info("Total tests extracted: %d", len(tests))
        self.logs.append(f"Таблиц обработано: {tables_used}")
        self.logs.append(f"Вопросов извлечено: {len(tests)}")

        log.info("=== EXTRACT END ===")
        return tests
