import json
import math
import os
import random
import shutil
import subprocess
import tempfile
import tkinter as tk
from tkinter import font as tkfont
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk
from docx import Document


@dataclass
class ContentItem:
    item_type: str  # "text" or "image"
    value: str


@dataclass
class TestOption:
    content: list[ContentItem]
    is_correct: bool = False


@dataclass
class TestQuestion:
    question: list[ContentItem]
    correct: list[ContentItem]
    options: list[TestOption]


@dataclass
class TestSession:
    questions: list[TestQuestion]
    answers: dict[int, int] = field(default_factory=dict)
    current_index: int = 0
    option_orders: dict[int, list[TestOption]] = field(default_factory=dict)
    finished: bool = False
    answer_status: dict[int, str] = field(default_factory=dict)


class WordTestExtractor:
    def __init__(
        self,
        file_path: Path,
        symbol: str,
        log_small_tables: bool,
        image_output_dir: Path,
    ):
        self.file_path = file_path
        self.symbol = symbol
        self.log_small_tables = log_small_tables
        self.extract_dir = image_output_dir
        self.logs: list[str] = []

    def cleanup(self) -> None:
        return

    def _convert_doc_to_docx(self, doc_path: Path) -> Path:
        converted = doc_path.with_suffix(".docx")
        if converted.exists():
            return converted
        temp_out = Path(tempfile.mkdtemp(prefix="word_test_docx_"))
        result = subprocess.run(
            [
                "soffice",
                "--headless",
                "--convert-to",
                "docx",
                "--outdir",
                str(temp_out),
                str(doc_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "Не удалось конвертировать .doc файл. "
                "Установите LibreOffice (soffice)."
            )
        candidates = sorted(temp_out.glob("*.docx"), key=lambda p: p.stat().st_mtime)
        if not candidates:
            raise RuntimeError("Конвертация .doc завершилась без результата.")
        return candidates[-1]

    def _load_document(self) -> Document:
        if self.file_path.suffix.lower() == ".doc":
            converted = self._convert_doc_to_docx(self.file_path)
            return Document(converted)
        return Document(self.file_path)

    def _extract_images(self, doc: Document) -> dict[str, Path]:
        self.extract_dir.mkdir(parents=True, exist_ok=True)
        image_map: dict[str, Path] = {}
        for rel_id, part in doc.part.related_parts.items():
            if "image" not in part.content_type:
                continue
            extension = Path(part.partname).suffix
            image_path = self.extract_dir / f"{rel_id}{extension}"
            with image_path.open("wb") as handle:
                handle.write(part.blob)
            image_map[rel_id] = image_path
        return image_map

    def _content_from_cell(self, cell, image_map: dict[str, Path]) -> list[ContentItem]:
        items: list[ContentItem] = []
        text_buffer: list[str] = []

        def flush_text() -> None:
            if text_buffer:
                items.append(ContentItem("text", "".join(text_buffer)))
                text_buffer.clear()

        for block in cell._tc.iterchildren():
            if block.tag.endswith("}p"):
                for run in block.iter():
                    if run.tag.endswith("}t") and run.text:
                        text_buffer.append(run.text)
                    if run.tag.endswith("}blip"):
                        flush_text()
                        embed = run.get(
                            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
                        )
                        if embed and embed in image_map:
                            items.append(ContentItem("image", str(image_map[embed])))
                flush_text()
        if not items:
            items.append(ContentItem("text", ""))
        return items

    def _row_has_text(self, row, image_map: dict[str, Path]) -> bool:
        for cell in row.cells:
            for item in self._content_from_cell(cell, image_map):
                if item.item_type == "text" and item.value.strip():
                    return True
        return False

    def extract(self) -> list[TestQuestion]:
        doc = self._load_document()
        image_map = self._extract_images(doc)
        tests: list[TestQuestion] = []

        for table_index, table in enumerate(doc.tables, start=1):
            if len(table.rows) < 3:
                if self.log_small_tables:
                    self.logs.append(
                        f"Таблица {table_index}: меньше 3 строк, пропущена."
                    )
                continue
            text_rows = sum(
                1 for row in table.rows if self._row_has_text(row, image_map)
            )
            if text_rows < 3:
                if self.log_small_tables:
                    self.logs.append(
                        f"Таблица {table_index}: меньше 3 строк с текстом, пропущена."
                    )
                continue

            row_contents: list[list[ContentItem]] = []
            for row in table.rows:
                cell_items: list[ContentItem] = []
                for cell in row.cells:
                    cell_items.extend(self._content_from_cell(cell, image_map))
                row_contents.append(cell_items)

            if len(row_contents) < 2:
                continue

            question = row_contents[0]
            correct_default = row_contents[1]
            options: list[TestOption] = []
            has_marked_correct = False

            def normalize_symbol(option_items: list[ContentItem]) -> bool:
                for item in option_items:
                    if item.item_type == "text" and item.value.strip().startswith(
                        self.symbol
                    ):
                        item.value = item.value.strip()[len(self.symbol) :].lstrip()
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

            if not has_marked_correct:
                options[0].is_correct = True

            for option in options:
                if option.is_correct:
                    correct_default = option.content
                    break

            tests.append(TestQuestion(question, correct_default, options))

        return tests


class TestApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Word Test Extractor")
        self.geometry("1024x720")
        self.minsize(900, 600)
        self._apply_style()

        self.app_dir = self._get_app_data_dir()
        self.app_dir.mkdir(parents=True, exist_ok=True)

        self.selected_file = tk.StringVar()
        self.symbol = tk.StringVar()
        self.log_small_tables = tk.BooleanVar(value=False)
        self.max_options = tk.IntVar(value=4)
        self.selected_test_file: Path | None = None

        self.question_count = tk.IntVar(value=0)
        self.random_questions = tk.BooleanVar(value=False)
        self.random_options = tk.BooleanVar(value=False)
        self.only_unanswered = tk.BooleanVar(value=False)
        self.show_answers_immediately = tk.BooleanVar(value=True)

        self.tests: list[TestQuestion] = []
        self.session: TestSession | None = None
        self.image_cache: list[ImageTk.PhotoImage] = []

        self._build_ui()

    def _build_ui(self) -> None:
        self.container = ttk.Frame(self)
        self.container.pack(fill=tk.BOTH, expand=True)

        self.main_frame = ttk.Frame(self.container, padding=10)
        self.import_frame = ttk.Frame(self.container, padding=10)
        self.settings_frame = ttk.Frame(self.container, padding=10)
        self.test_frame = ttk.Frame(self.container, padding=10)

        for frame in (self.main_frame, self.import_frame, self.settings_frame, self.test_frame):
            frame.grid(row=0, column=0, sticky="nsew")
        self.container.rowconfigure(0, weight=1)
        self.container.columnconfigure(0, weight=1)

        self._build_main_ui()
        self._build_import_ui()
        self._build_settings_ui()
        self._build_test_ui()
        self._show_frame(self.main_frame)
        self._refresh_saved_tests()

    def _show_frame(self, frame: ttk.Frame) -> None:
        frame.tkraise()

    def _build_main_ui(self) -> None:
        header = ttk.Label(
            self.main_frame,
            text="Главное меню",
            font=("Segoe UI", 16, "bold"),
        )
        header.pack(anchor=tk.W, pady=5)
        ttk.Button(
            self.main_frame, text="Импортировать тесты", command=self._open_import
        ).pack(anchor=tk.E, pady=5)
        results_frame = ttk.LabelFrame(
            self.main_frame, text="Сохранённые тесты", padding=10
        )
        results_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.cards_canvas = tk.Canvas(results_frame, highlightthickness=0, bg="#f5f5f5")
        self.cards_scroll = ttk.Scrollbar(
            results_frame, orient=tk.VERTICAL, command=self.cards_canvas.yview
        )
        self.cards_canvas.configure(yscrollcommand=self.cards_scroll.set)
        self.cards_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.cards_canvas.pack(fill=tk.BOTH, expand=True)
        self.cards_container = tk.Frame(self.cards_canvas, bg="#f5f5f5")
        self.cards_canvas.create_window((0, 0), window=self.cards_container, anchor="nw")
        self.cards_container.bind(
            "<Configure>",
            lambda event: self.cards_canvas.configure(
                scrollregion=self.cards_canvas.bbox("all")
            ),
        )
        ttk.Button(
            self.main_frame, text="Обновить список", command=self._refresh_saved_tests
        ).pack(anchor=tk.E, pady=5)

    def _build_import_ui(self) -> None:
        header = ttk.Label(
            self.import_frame,
            text="Импорт тестов",
            font=("Segoe UI", 16, "bold"),
        )
        header.pack(anchor=tk.W, pady=5)
        ttk.Button(
            self.import_frame, text="Назад в меню", command=self._go_to_main_menu
        ).pack(anchor=tk.E)
        file_frame = ttk.LabelFrame(self.import_frame, text="Файл Word", padding=10)
        file_frame.pack(fill=tk.X, pady=5)

        ttk.Entry(file_frame, textvariable=self.selected_file, width=80).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(file_frame, text="Выбрать", command=self._choose_file).pack(
            side=tk.LEFT, padx=5
        )

        settings_frame = ttk.LabelFrame(
            self.import_frame, text="Настройки извлечения", padding=10
        )
        settings_frame.pack(fill=tk.X, pady=5)

        ttk.Label(settings_frame, text="Спец. символ для правильного ответа:").grid(
            row=0, column=0, sticky=tk.W, pady=2
        )
        ttk.Entry(settings_frame, textvariable=self.symbol, width=10).grid(
            row=0, column=1, sticky=tk.W, pady=2
        )
        ttk.Checkbutton(
            settings_frame,
            text="Показывать таблицы меньше 3 строк в логах",
            variable=self.log_small_tables,
        ).grid(row=1, column=0, columnspan=2, sticky=tk.W, pady=2)

        ttk.Button(
            self.import_frame, text="Извлечь тесты", command=self._extract_tests
        ).pack(pady=10)

        self.extract_status = ttk.Label(self.import_frame, text="")
        self.extract_status.pack(anchor=tk.W)

        log_frame = ttk.LabelFrame(self.import_frame, text="Логи", padding=10)
        log_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.log_text = tk.Text(log_frame, height=6, state=tk.DISABLED, wrap=tk.WORD)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def _build_settings_ui(self) -> None:
        header = ttk.Label(
            self.settings_frame,
            text="Настройки теста",
            font=("Segoe UI", 16, "bold"),
        )
        header.pack(anchor=tk.W, pady=5)
        info_frame = ttk.Frame(self.settings_frame)
        info_frame.pack(fill=tk.X, pady=5)
        self.selected_test_label = ttk.Label(info_frame, text="Тест не выбран")
        self.selected_test_label.pack(side=tk.LEFT)
        ttk.Button(
            info_frame, text="Назад в меню", command=self._go_to_main_menu
        ).pack(side=tk.RIGHT)

        settings_frame = ttk.LabelFrame(
            self.settings_frame, text="Настройки перед тестированием", padding=10
        )
        settings_frame.pack(fill=tk.X, pady=5)

        ttk.Label(settings_frame, text="Количество вопросов (0 = все):").grid(
            row=0, column=0, sticky=tk.W, pady=2
        )
        ttk.Entry(settings_frame, textvariable=self.question_count, width=10).grid(
            row=0, column=1, sticky=tk.W, pady=2
        )
        ttk.Checkbutton(
            settings_frame,
            text="Случайный порядок вопросов",
            variable=self.random_questions,
        ).grid(row=1, column=0, columnspan=2, sticky=tk.W, pady=2)
        ttk.Checkbutton(
            settings_frame,
            text="Случайный порядок вариантов ответов",
            variable=self.random_options,
        ).grid(row=2, column=0, columnspan=2, sticky=tk.W, pady=2)
        ttk.Checkbutton(
            settings_frame,
            text="Только нерешённые вопросы",
            variable=self.only_unanswered,
        ).grid(row=3, column=0, columnspan=2, sticky=tk.W, pady=2)
        ttk.Checkbutton(
            settings_frame,
            text="Показывать правильный ответ сразу",
            variable=self.show_answers_immediately,
        ).grid(row=4, column=0, columnspan=2, sticky=tk.W, pady=2)

        ttk.Label(settings_frame, text="Макс. вариантов ответа:").grid(
            row=0, column=2, sticky=tk.W, padx=10, pady=2
        )
        ttk.Entry(settings_frame, textvariable=self.max_options, width=5).grid(
            row=0, column=3, sticky=tk.W, pady=2
        )

        ttk.Button(
            self.settings_frame, text="Начать тестирование", command=self._start_test
        ).pack(pady=10)

    def _build_test_ui(self) -> None:
        header = ttk.Label(
            self.test_frame,
            text="Тестирование",
            font=("Segoe UI", 16, "bold"),
        )
        header.pack(anchor=tk.W, pady=5)

        nav_container = ttk.Frame(self.test_frame)
        nav_container.pack(fill=tk.X, pady=5)
        self.question_nav_canvas = tk.Canvas(
            nav_container, height=40, highlightthickness=0, bg="#f5f5f5"
        )
        self.question_nav_canvas.pack(side=tk.TOP, fill=tk.X, expand=True)
        self.question_nav_scroll = ttk.Scrollbar(
            nav_container,
            orient=tk.HORIZONTAL,
            command=self.question_nav_canvas.xview,
            style="Thin.Horizontal.TScrollbar",
        )
        self.question_nav_scroll.pack(side=tk.BOTTOM, fill=tk.X)
        self.question_nav_canvas.configure(xscrollcommand=self.question_nav_scroll.set)
        self.question_nav_frame = ttk.Frame(self.question_nav_canvas)
        self.question_nav_canvas.create_window(
            (0, 0), window=self.question_nav_frame, anchor="nw"
        )
        self.question_nav_frame.bind(
            "<Configure>",
            lambda event: self.question_nav_canvas.configure(
                scrollregion=self.question_nav_canvas.bbox("all")
            ),
        )
        self.nav_buttons: list[ttk.Button] = []

        self.question_canvas = tk.Canvas(self.test_frame, borderwidth=1, relief=tk.SOLID)
        self.question_scroll = ttk.Scrollbar(
            self.test_frame,
            orient=tk.VERTICAL,
            command=self.question_canvas.yview,
            style="Thin.Vertical.TScrollbar",
        )
        self.question_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.question_canvas.pack(fill=tk.BOTH, expand=True, pady=5)
        self.question_canvas.configure(yscrollcommand=self.question_scroll.set)

        self.question_container = ttk.Frame(self.question_canvas)
        self.question_canvas.create_window((0, 0), window=self.question_container, anchor="nw")
        self.question_container.bind(
            "<Configure>",
            lambda event: self.question_canvas.configure(
                scrollregion=self.question_canvas.bbox("all")
            ),
        )

        nav_buttons = ttk.Frame(self.test_frame)
        nav_buttons.pack(fill=tk.X, pady=5)
        ttk.Button(nav_buttons, text="Назад", command=self._prev_question).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(nav_buttons, text="Дальше", command=self._next_question).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(nav_buttons, text="Завершить тест", command=self._finish_test).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(nav_buttons, text="Выход", command=self._exit_test).pack(
            side=tk.RIGHT, padx=5
        )

        self.answer_feedback_label = ttk.Label(self.test_frame, text="")
        self.answer_feedback_label.pack(anchor=tk.W, pady=2)
        self.report_label = ttk.Label(self.test_frame, text="", foreground="blue")
        self.report_label.pack(anchor=tk.W, pady=5)

    def _apply_style(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background="#f5f5f5")
        style.configure("TLabel", background="#f5f5f5", font=("Segoe UI", 10))
        style.configure("TButton", padding=6, font=("Segoe UI", 10))
        style.configure("TLabelframe", background="#f5f5f5", font=("Segoe UI", 10, "bold"))
        style.configure("TLabelframe.Label", background="#f5f5f5")
        style.configure("Current.TButton", background="#bbdefb")
        style.configure("Pending.TButton", background="#e0e0e0")
        style.configure("Neutral.TButton", background="#ffeb3b")
        style.configure("Correct.TButton", background="#4caf50", foreground="white")
        style.configure("Incorrect.TButton", background="#f44336", foreground="white")
        style.configure("Thin.Vertical.TScrollbar", gripcount=0, width=8)
        style.configure("Thin.Horizontal.TScrollbar", gripcount=0, width=8)

    def _get_app_data_dir(self) -> Path:
        if os.name == "nt":
            base = Path(os.getenv("APPDATA", Path.home()))
            return base / "WordTestExtractor"
        return Path.home() / ".local" / "share" / "word_test_extractor"

    def _choose_file(self) -> None:
        file_path = filedialog.askopenfilename(
            filetypes=[("Word files", "*.doc *.docx")]
        )
        if file_path:
            self.selected_file.set(file_path)

    def _extract_tests(self) -> None:
        path = self.selected_file.get()
        if not path:
            messagebox.showwarning("Ошибка", "Выберите Word файл.")
            return
        base_name = Path(path).stem
        output_dir = self.app_dir / "extracted_tests"
        output_dir.mkdir(exist_ok=True)
        image_dir = output_dir / f"{base_name}_images"
        extractor = WordTestExtractor(
            Path(path),
            self.symbol.get().strip(),
            self.log_small_tables.get(),
            image_dir,
        )
        try:
            tests = extractor.extract()
        except Exception as exc:
            extractor.cleanup()
            messagebox.showerror("Ошибка", str(exc))
            return

        self.tests = tests
        base_name = Path(path).stem
        output_dir = self.app_dir / "extracted_tests"
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{base_name}.json"
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(self._serialize_tests(tests), handle, ensure_ascii=False, indent=2)

        self.extract_status.config(
            text=f"Извлечено тестов: {len(tests)}. Сохранено: {output_path}"
        )
        self._refresh_saved_tests()
        self._update_logs(extractor.logs)
        extractor.cleanup()

    def _refresh_saved_tests(self) -> None:
        output_dir = self.app_dir / "extracted_tests"
        for widget in self.cards_container.winfo_children():
            widget.destroy()
        if not output_dir.exists():
            return
        stats = self._load_test_stats(output_dir)
        for test_file in sorted(output_dir.glob("*.json")):
            if test_file.name == "results.json":
                continue
            questions = self._count_questions(test_file)
            test_stats = stats.get(test_file.name, {})
            best = test_stats.get("best_score")
            attempts = test_stats.get("attempts", 0)
            correct_total = best or 0
            learned_percent = (correct_total / questions * 100) if questions else 0
            stats_line = (
                f"Правильно {correct_total}/{questions} | "
                f"Изучено {learned_percent:.1f}% | "
                f"Попытки: {attempts}"
            )
            self._create_test_card(test_file, questions, stats_line, learned_percent)

    def _create_test_card(
        self, test_file: Path, questions: int, stats_line: str, learned_percent: float
    ) -> None:
        background = self._progress_color(learned_percent)
        card = tk.Frame(
            self.cards_container,
            bg=background,
            highlightthickness=1,
            highlightbackground="#e0e0e0",
            padx=12,
            pady=10,
        )
        card.pack(fill=tk.X, pady=6)
        title = tk.Label(
            card,
            text=test_file.stem,
            font=("Segoe UI", 12, "bold"),
            bg=background,
        )
        title.pack(anchor=tk.W)
        info = tk.Label(
            card,
            text=f"Вопросов: {questions}",
            font=("Segoe UI", 10),
            bg=background,
        )
        info.pack(anchor=tk.W, pady=(2, 0))
        stats = tk.Label(
            card,
            text=stats_line,
            font=("Segoe UI", 9),
            fg="#666666",
            bg=background,
        )
        stats.pack(anchor=tk.W, pady=(2, 0))

        delete_button = tk.Button(
            card,
            text="Удалить",
            bg="#ffebee",
            fg="#c62828",
            relief=tk.FLAT,
            command=lambda: self._delete_test(test_file),
        )
        delete_button.pack(anchor=tk.E, pady=(6, 0))

        def on_click(_event: tk.Event) -> None:
            self._select_test(test_file)

        card.bind("<Button-1>", on_click)
        title.bind("<Button-1>", on_click)
        info.bind("<Button-1>", on_click)
        stats.bind("<Button-1>", on_click)

    def _progress_color(self, percent: float) -> str:
        percent = max(0.0, min(100.0, percent)) / 100.0
        start = (255, 255, 255)
        end = (200, 230, 201)
        red = int(start[0] + (end[0] - start[0]) * percent)
        green = int(start[1] + (end[1] - start[1]) * percent)
        blue = int(start[2] + (end[2] - start[2]) * percent)
        return f"#{red:02x}{green:02x}{blue:02x}"

    def _select_test(self, test_file: Path) -> None:
        self.selected_test_file = test_file
        self.selected_test_label.config(text=f"Выбран тест: {test_file.name}")
        self._show_frame(self.settings_frame)

    def _delete_test(self, test_file: Path) -> None:
        if not messagebox.askyesno(
            "Удаление", f"Удалить тест {test_file.name} и все связанные файлы?"
        ):
            return
        try:
            test_file.unlink(missing_ok=True)
            images_dir = test_file.parent / f"{test_file.stem}_images"
            shutil.rmtree(images_dir, ignore_errors=True)
            stats = self._load_test_stats(test_file.parent)
            if test_file.name in stats:
                stats.pop(test_file.name, None)
                with (test_file.parent / "results.json").open(
                    "w", encoding="utf-8"
                ) as handle:
                    json.dump(stats, handle, ensure_ascii=False, indent=2)
        except OSError as exc:
            messagebox.showerror("Ошибка", str(exc))
        self._refresh_saved_tests()

    def _load_test_stats(self, output_dir: Path) -> dict[str, dict]:
        stats_file = output_dir / "results.json"
        if not stats_file.exists():
            return {}
        with stats_file.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _save_test_stats(self, test_file: Path, correct: int, total: int) -> None:
        output_dir = test_file.parent
        stats = self._load_test_stats(output_dir)
        record = stats.get(test_file.name, {})
        attempts = record.get("attempts", 0) + 1
        best_score = max(record.get("best_score", 0), correct)
        stats[test_file.name] = {
            "last_score": correct,
            "best_score": best_score,
            "attempts": attempts,
        }
        with (output_dir / "results.json").open("w", encoding="utf-8") as handle:
            json.dump(stats, handle, ensure_ascii=False, indent=2)

    def _count_questions(self, test_file: Path) -> int:
        with test_file.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return len(data)

    def _update_logs(self, logs: list[str]) -> None:
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete("1.0", tk.END)
        if logs:
            self.log_text.insert(tk.END, "\n".join(logs))
        else:
            self.log_text.insert(tk.END, "Нет предупреждений.")
        self.log_text.config(state=tk.DISABLED)

    def _serialize_tests(self, tests: list[TestQuestion]) -> list[dict]:
        def serialize_content(content: list[ContentItem]) -> list[dict]:
            return [{"type": item.item_type, "value": item.value} for item in content]

        return [
            {
                "question": serialize_content(test.question),
                "correct": serialize_content(test.correct),
                "options": [
                    {
                        "content": serialize_content(option.content),
                        "is_correct": option.is_correct,
                    }
                    for option in test.options
                ],
            }
            for test in tests
        ]

    def _start_test(self) -> None:
        if not self.selected_test_file:
            messagebox.showwarning("Ошибка", "Выберите тест из списка.")
            return
        self.tests = self._load_tests_from_file(self.selected_test_file)
        if not self.tests:
            messagebox.showwarning("Ошибка", "Тест пустой или не найден.")
            return
        questions = list(self.tests)
        if self.only_unanswered.get():
            questions = [
                q for index, q in enumerate(questions) if index not in self._load_progress()
            ]
        if self.random_questions.get():
            random.shuffle(questions)
        count = self.question_count.get()
        if count > 0:
            questions = questions[:count]
        self.session = TestSession(questions=questions)
        self.report_label.config(text="")
        self.answer_feedback_label.config(text="")
        self._render_question_nav()
        self._show_question()
        self._show_frame(self.test_frame)

    def _load_tests_from_file(self, test_file: Path) -> list[TestQuestion]:
        with test_file.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        tests: list[TestQuestion] = []
        for entry in data:
            question = [ContentItem(item["type"], item["value"]) for item in entry["question"]]
            correct = [ContentItem(item["type"], item["value"]) for item in entry["correct"]]
            options = [
                TestOption(
                    [ContentItem(item["type"], item["value"]) for item in option["content"]],
                    option["is_correct"],
                )
                for option in entry["options"]
            ]
            tests.append(TestQuestion(question, correct, options))
        return tests

    def _load_progress(self) -> set[int]:
        progress_file = self.app_dir / "progress.json"
        if not progress_file.exists():
            return set()
        with progress_file.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return set(data.get("answered_indices", []))

    def _save_progress(self) -> None:
        if not self.session:
            return
        progress_file = self.app_dir / "progress.json"
        answered_indices = list(self.session.answers.keys())
        with progress_file.open("w", encoding="utf-8") as handle:
            json.dump({"answered_indices": answered_indices}, handle, ensure_ascii=False)

    def _render_question_nav(self) -> None:
        for widget in self.question_nav_frame.winfo_children():
            widget.destroy()
        self.nav_buttons = []
        if not self.session:
            return
        for index in range(len(self.session.questions)):
            style_name = "Pending.TButton"
            status = self.session.answer_status.get(index, "unanswered")
            if self.session.finished:
                if status == "correct":
                    style_name = "Correct.TButton"
                elif status == "incorrect":
                    style_name = "Incorrect.TButton"
            else:
                if not self.show_answers_immediately.get():
                    style_name = "Neutral.TButton"
                elif status == "correct":
                    style_name = "Correct.TButton"
                elif status == "incorrect":
                    style_name = "Incorrect.TButton"
            if index == self.session.current_index:
                style_name = "Current.TButton"
            button = ttk.Button(
                self.question_nav_frame,
                text=str(index + 1),
                width=3,
                style=style_name,
                command=lambda idx=index: self._jump_to_question(idx),
            )
            button.pack(side=tk.LEFT, padx=2)
            self.nav_buttons.append(button)
        self._center_nav_on_current()

    def _jump_to_question(self, index: int) -> None:
        if not self.session:
            return
        self.session.current_index = index
        self._show_question()
        self._center_nav_on_current()

    def _clear_question(self) -> None:
        for widget in self.question_container.winfo_children():
            widget.destroy()
        self.image_cache.clear()

    def _show_question(self) -> None:
        if not self.session:
            return
        if not self.session.questions:
            messagebox.showinfo("Информация", "Нет вопросов для тестирования.")
            return
        self._clear_question()
        question = self.session.questions[self.session.current_index]
        if not self.show_answers_immediately.get() or self.session.finished:
            self.answer_feedback_label.config(text="")

        ttk.Label(
            self.question_container,
            text=f"Вопрос {self.session.current_index + 1} из {len(self.session.questions)}",
            font=("Arial", 12, "bold"),
        ).pack(anchor=tk.W, pady=5)

        self._render_content_block(self.question_container, question.question)
        ttk.Separator(self.question_container, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=5)

        if self.random_options.get():
            options = self.session.option_orders.get(self.session.current_index)
            if not options:
                options = list(question.options)
                random.shuffle(options)
        else:
            options = list(question.options)

        max_opts = max(1, self.max_options.get())
        options = options[:max_opts]
        self.session.option_orders[self.session.current_index] = options

        selected_var = tk.IntVar(
            value=self.session.answers.get(self.session.current_index, -1)
        )
        selected_idx = self.session.answers.get(self.session.current_index, -1)
        correct_idx = next(
            (i for i, option in enumerate(options) if option.is_correct), None
        )

        for idx, option in enumerate(options):
            status_color = "#ffffff"
            if self.session.finished:
                if correct_idx is not None and idx == correct_idx:
                    status_color = "#c8e6c9"
                elif selected_idx == idx:
                    status_color = "#ffcdd2"
            else:
                if selected_idx == idx:
                    if not self.show_answers_immediately.get():
                        status_color = "#fff9c4"
                    elif correct_idx is not None and idx == correct_idx:
                        status_color = "#c8e6c9"
                    else:
                        status_color = "#ffcdd2"
            frame = tk.Frame(
                self.question_container,
                bg=status_color,
                highlightthickness=1,
                highlightbackground="#e0e0e0",
                padx=8,
                pady=6,
            )
            frame.pack(fill=tk.X, pady=4)
            rb = tk.Radiobutton(
                frame,
                text=f"{idx + 1}.",
                variable=selected_var,
                value=idx,
                command=lambda: self._save_answer(selected_var.get(), options),
                bg=status_color,
                anchor="w",
            )
            if self.session.finished:
                rb.config(state=tk.DISABLED)
            rb.pack(anchor=tk.W)
            self._render_content_block(frame, option.content)
        self._render_question_nav()

    def _render_content_block(self, parent, content: list[ContentItem]) -> None:
        text_font = tkfont.Font(family="Segoe UI", size=10)
        line_height = max(1, text_font.metrics("linespace"))
        max_image_height = int(line_height * 1.5)
        max_used_image_height = 0
        background = "#f5f5f5"
        if isinstance(parent, tk.Widget):
            try:
                background = parent.cget("bg")
            except tk.TclError:
                try:
                    background = parent.cget("background")
                except tk.TclError:
                    style = ttk.Style()
                    background = style.lookup(parent.winfo_class(), "background") or background
        text = tk.Text(
            parent,
            wrap=tk.WORD,
            height=1,
            borderwidth=0,
            highlightthickness=0,
            bg=background,
            font=text_font,
        )
        text.pack(fill=tk.X, anchor=tk.W)
        for item in content:
            if item.item_type == "text":
                if item.value:
                    text.insert(tk.END, item.value)
            elif item.item_type == "image" and Path(item.value).exists():
                image = Image.open(item.value)
                if image.height > max_image_height:
                    ratio = max_image_height / image.height
                    width = max(1, int(image.width * ratio))
                    image = image.resize((width, max_image_height), Image.LANCZOS)
                max_used_image_height = max(max_used_image_height, image.height)
                photo = ImageTk.PhotoImage(image)
                self.image_cache.append(photo)
                text.image_create(tk.END, image=photo)
            text.insert(tk.END, " ")
        text.update_idletasks()
        lines = int(text.index("end-1c").split(".")[0])
        image_lines = math.ceil(max_used_image_height / line_height) if max_used_image_height else 1
        text.configure(height=max(1, lines, image_lines + 1))
        text.configure(state=tk.DISABLED)

    def _save_answer(self, selected_idx: int, options: list[TestOption]) -> None:
        if not self.session:
            return
        if self.session.finished:
            return
        self.session.answers[self.session.current_index] = selected_idx
        correct_idx = next((i for i, option in enumerate(options) if option.is_correct), None)
        if correct_idx is None:
            self.session.answer_status[self.session.current_index] = "unanswered"
        elif selected_idx == correct_idx:
            self.session.answer_status[self.session.current_index] = "correct"
        else:
            self.session.answer_status[self.session.current_index] = "incorrect"
        self._save_progress()
        self._render_question_nav()
        self._show_question()
        if self.show_answers_immediately.get():
            if correct_idx is None:
                self.answer_feedback_label.config(
                    text="Правильный ответ не указан.", foreground="#ff9800"
                )
            elif selected_idx == correct_idx:
                self.answer_feedback_label.config(text="Верно!", foreground="#4caf50")
            else:
                self.answer_feedback_label.config(
                    text=f"Неверно. Правильный вариант: {correct_idx + 1}",
                    foreground="#f44336",
                )

    def _next_question(self) -> None:
        if not self.session:
            return
        if self.session.current_index < len(self.session.questions) - 1:
            self.session.current_index += 1
            self._show_question()
            self._center_nav_on_current()

    def _prev_question(self) -> None:
        if not self.session:
            return
        if self.session.current_index > 0:
            self.session.current_index -= 1
            self._show_question()
            self._center_nav_on_current()

    def _finish_test(self) -> None:
        if not self.session:
            return
        if self.session.finished:
            return
        self.session.finished = True
        total = len(self.session.questions)
        correct = 0
        answered = 0
        for idx, question in enumerate(self.session.questions):
            answer = self.session.answers.get(idx)
            if answer is None or answer == -1:
                continue
            answered += 1
            options = self.session.option_orders.get(idx, question.options)
            if answer < len(options) and options[answer].is_correct:
                correct += 1
        percent = (correct / total * 100) if total else 0
        self.report_label.config(
            text=f"Результат: {correct}/{total} правильных, "
            f"отвечено {answered}, {percent:.1f}%"
        )
        if self.selected_test_file:
            self._save_test_stats(self.selected_test_file, correct, total)
            self._refresh_saved_tests()
        if not self.show_answers_immediately.get():
            messagebox.showinfo(
                "Ответы",
                f"Правильных ответов: {correct} из {total} ({percent:.1f}%)",
            )
        self._render_question_nav()
        self._show_question()

    def _exit_test(self) -> None:
        self._go_to_main_menu()

    def _go_to_main_menu(self) -> None:
        self._show_frame(self.main_frame)

    def _open_import(self) -> None:
        self._show_frame(self.import_frame)

    def _center_nav_on_current(self) -> None:
        if not self.session or not self.nav_buttons:
            return
        index = self.session.current_index
        if index < 0 or index >= len(self.nav_buttons):
            return
        self.update_idletasks()
        button = self.nav_buttons[index]
        button_center = button.winfo_x() + button.winfo_width() / 2
        total_width = max(1, self.question_nav_frame.winfo_reqwidth())
        view_width = max(1, self.question_nav_canvas.winfo_width())
        target = max(0, min(button_center - view_width / 2, total_width - view_width))
        self.question_nav_canvas.xview_moveto(target / total_width)


if __name__ == "__main__":
    app = TestApp()
    app.mainloop()
