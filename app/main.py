import json
import random
import shutil
import subprocess
import tempfile
import tkinter as tk
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


class WordTestExtractor:
    def __init__(self, file_path: Path, symbol: str, log_small_tables: bool):
        self.file_path = file_path
        self.symbol = symbol
        self.log_small_tables = log_small_tables
        self.extract_dir = Path(tempfile.mkdtemp(prefix="word_test_images_"))
        self.logs: list[str] = []

    def cleanup(self) -> None:
        shutil.rmtree(self.extract_dir, ignore_errors=True)

    def _convert_doc_to_docx(self, doc_path: Path) -> Path:
        converted = doc_path.with_suffix(".docx")
        if converted.exists():
            return converted
        result = subprocess.run(
            [
                "soffice",
                "--headless",
                "--convert-to",
                "docx",
                "--outdir",
                str(doc_path.parent),
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
        if not converted.exists():
            raise RuntimeError("Конвертация .doc завершилась без результата.")
        return converted

    def _load_document(self) -> Document:
        if self.file_path.suffix.lower() == ".doc":
            converted = self._convert_doc_to_docx(self.file_path)
            return Document(converted)
        return Document(self.file_path)

    def _extract_images(self, doc: Document) -> dict[str, Path]:
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

        self.selected_file = tk.StringVar()
        self.symbol = tk.StringVar()
        self.log_small_tables = tk.BooleanVar(value=False)
        self.max_options = tk.IntVar(value=4)

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
        notebook = ttk.Notebook(self)
        notebook.pack(fill=tk.BOTH, expand=True)

        self.extract_frame = ttk.Frame(notebook, padding=10)
        self.test_frame = ttk.Frame(notebook, padding=10)
        notebook.add(self.extract_frame, text="Извлечение")
        notebook.add(self.test_frame, text="Тестирование")

        self._build_extract_ui()
        self._build_test_ui()

    def _build_extract_ui(self) -> None:
        file_frame = ttk.LabelFrame(self.extract_frame, text="Файл Word", padding=10)
        file_frame.pack(fill=tk.X, pady=5)

        ttk.Entry(file_frame, textvariable=self.selected_file, width=80).pack(
            side=tk.LEFT, padx=5
        )
        ttk.Button(file_frame, text="Выбрать", command=self._choose_file).pack(
            side=tk.LEFT, padx=5
        )

        settings_frame = ttk.LabelFrame(
            self.extract_frame, text="Настройки извлечения", padding=10
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
            self.extract_frame, text="Извлечь тесты", command=self._extract_tests
        ).pack(pady=10)

        self.extract_status = ttk.Label(self.extract_frame, text="")
        self.extract_status.pack(anchor=tk.W)

        results_frame = ttk.LabelFrame(
            self.extract_frame, text="Сохранённые тесты", padding=10
        )
        results_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.extracted_list = tk.Listbox(results_frame, height=6)
        self.extracted_list.pack(fill=tk.BOTH, expand=True, side=tk.LEFT)
        ttk.Button(
            results_frame, text="Обновить список", command=self._refresh_saved_tests
        ).pack(side=tk.RIGHT, padx=5)

        log_frame = ttk.LabelFrame(self.extract_frame, text="Логи", padding=10)
        log_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        self.log_text = tk.Text(log_frame, height=6, state=tk.DISABLED, wrap=tk.WORD)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def _build_test_ui(self) -> None:
        settings_frame = ttk.LabelFrame(
            self.test_frame, text="Настройки перед тестированием", padding=10
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
            self.test_frame, text="Начать тестирование", command=self._start_test
        ).pack(pady=5)

        self.question_nav_frame = ttk.Frame(self.test_frame)
        self.question_nav_frame.pack(fill=tk.X, pady=5)

        self.question_canvas = tk.Canvas(self.test_frame, borderwidth=1, relief=tk.SOLID)
        self.question_canvas.pack(fill=tk.BOTH, expand=True, pady=5)
        self.question_scroll = ttk.Scrollbar(
            self.test_frame, orient=tk.VERTICAL, command=self.question_canvas.yview
        )
        self.question_canvas.configure(yscrollcommand=self.question_scroll.set)
        self.question_scroll.pack(side=tk.RIGHT, fill=tk.Y)

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
        extractor = WordTestExtractor(
            Path(path),
            self.symbol.get().strip(),
            self.log_small_tables.get(),
        )
        try:
            tests = extractor.extract()
        except Exception as exc:
            extractor.cleanup()
            messagebox.showerror("Ошибка", str(exc))
            return

        self.tests = tests
        base_name = Path(path).stem
        output_dir = Path(path).parent / "extracted_tests"
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
        self.extracted_list.delete(0, tk.END)
        selected = self.selected_file.get()
        if not selected:
            return
        output_dir = Path(selected).parent / "extracted_tests"
        if not output_dir.exists():
            return
        for test_file in sorted(output_dir.glob("*.json")):
            self.extracted_list.insert(tk.END, test_file.name)

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
        if not self.tests:
            messagebox.showwarning("Ошибка", "Сначала извлеките тесты.")
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
        self._render_question_nav()
        self._show_question()

    def _load_progress(self) -> set[int]:
        progress_file = Path("progress.json")
        if not progress_file.exists():
            return set()
        with progress_file.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return set(data.get("answered_indices", []))

    def _save_progress(self) -> None:
        if not self.session:
            return
        progress_file = Path("progress.json")
        answered_indices = list(self.session.answers.keys())
        with progress_file.open("w", encoding="utf-8") as handle:
            json.dump({"answered_indices": answered_indices}, handle, ensure_ascii=False)

    def _render_question_nav(self) -> None:
        for widget in self.question_nav_frame.winfo_children():
            widget.destroy()
        if not self.session:
            return
        for index in range(len(self.session.questions)):
            button = ttk.Button(
                self.question_nav_frame,
                text=str(index + 1),
                width=3,
                command=lambda idx=index: self._jump_to_question(idx),
            )
            button.pack(side=tk.LEFT, padx=2)

    def _jump_to_question(self, index: int) -> None:
        if not self.session:
            return
        self.session.current_index = index
        self._show_question()

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
                self.session.option_orders[self.session.current_index] = options
        else:
            options = list(question.options)

        max_opts = max(1, self.max_options.get())
        options = options[:max_opts]

        selected_var = tk.IntVar(
            value=self.session.answers.get(self.session.current_index, -1)
        )

        for idx, option in enumerate(options):
            frame = ttk.Frame(self.question_container)
            frame.pack(fill=tk.X, pady=2)
            rb = ttk.Radiobutton(
                frame,
                text=f"Вариант {idx + 1}",
                variable=selected_var,
                value=idx,
                command=lambda: self._save_answer(selected_var.get(), options),
            )
            rb.pack(anchor=tk.W)
            self._render_content_block(frame, option.content)

    def _render_content_block(self, parent, content: list[ContentItem]) -> None:
        for item in content:
            if item.item_type == "text":
                if item.value.strip():
                    ttk.Label(parent, text=item.value, wraplength=880).pack(anchor=tk.W)
            elif item.item_type == "image" and Path(item.value).exists():
                image = Image.open(item.value)
                image.thumbnail((600, 400))
                photo = ImageTk.PhotoImage(image)
                self.image_cache.append(photo)
                ttk.Label(parent, image=photo).pack(anchor=tk.W, pady=2)

    def _save_answer(self, selected_idx: int, options: list[TestOption]) -> None:
        if not self.session:
            return
        self.session.answers[self.session.current_index] = selected_idx
        self._save_progress()
        if self.show_answers_immediately.get():
            correct_idx = next(
                (i for i, option in enumerate(options) if option.is_correct), None
            )
            if correct_idx is None:
                messagebox.showinfo("Ответ", "Правильный ответ не указан.")
            elif selected_idx == correct_idx:
                messagebox.showinfo("Ответ", "Верно!")
            else:
                messagebox.showinfo("Ответ", f"Неверно. Правильный вариант: {correct_idx + 1}")

    def _next_question(self) -> None:
        if not self.session:
            return
        if self.session.current_index < len(self.session.questions) - 1:
            self.session.current_index += 1
            self._show_question()

    def _prev_question(self) -> None:
        if not self.session:
            return
        if self.session.current_index > 0:
            self.session.current_index -= 1
            self._show_question()

    def _finish_test(self) -> None:
        if not self.session:
            return
        total = len(self.session.questions)
        correct = 0
        answered = 0
        for idx, question in enumerate(self.session.questions):
            answer = self.session.answers.get(idx)
            if answer is None or answer == -1:
                continue
            answered += 1
            if answer < len(question.options) and question.options[answer].is_correct:
                correct += 1
        percent = (correct / total * 100) if total else 0
        self.report_label.config(
            text=f"Результат: {correct}/{total} правильных, "
            f"отвечено {answered}, {percent:.1f}%"
        )
        if not self.show_answers_immediately.get():
            messagebox.showinfo(
                "Ответы",
                f"Правильных ответов: {correct} из {total} ({percent:.1f}%)",
            )

    def _exit_test(self) -> None:
        if messagebox.askyesno("Выход", "Выйти из теста?"):
            self.destroy()


if __name__ == "__main__":
    app = TestApp()
    app.mainloop()
