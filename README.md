# BSU-test-master

## Что добавлено

- JSON-формат тестов, разбитый на блоки и инлайны (подходит для фронтенда).
- FastAPI-сервис для загрузки тестов и выдачи JSON/asset файлов.
- Web UI для импорта и прохождения тестов (MathJax для формул, `<img>` для картинок).
- CLI для извлечения тестов без UI.

## Web UI (основной интерфейс)

```bash
uvicorn api:app --reload
```

После запуска откройте `http://localhost:8000/`.

### Что можно сделать в Web UI

- Импортировать тесты из `.docx` (формат `.doc` не поддерживается).
- Настраивать порядок вопросов/вариантов, лимит вариантов, фильтр по нерешённым.
- Проходить тест с прогрессом и итоговыми результатами.

## CLI

```bash
python cli.py path/to/test.docx --output data/tests
```

После запуска появится папка `data/tests/<test_id>/` с `test.json` и ассетами.

## API

- Загрузка теста: `POST /api/tests/upload` (multipart/form-data, поле `file`).
- Список тестов: `GET /api/tests`.
- JSON теста: `GET /api/tests/{test_id}`.
- Ассеты: `GET /api/tests/{test_id}/assets/{path}`.

### Телеметрия попыток (JSON-контракт)

Все поля и их типы используются одинаково на фронтенде и бэкенде.

#### Событие попытки

`POST /api/attempts/{attemptId}/events`

```json
{
  "attemptId": "string",
  "testId": "string",
  "clientId": "string",
  "ts": "2024-01-01T12:00:00.000Z",
  "timezone": "Europe/Minsk",
  "settings": {},
  "questionId": 1,
  "questionIndex": 0,
  "answerId": 2,
  "isCorrect": true,
  "durationMs": 1234,
  "isSkipped": false,
  "eventType": "question_answered"
}
```

#### Финализация попытки

`POST /api/attempts/{attemptId}/finalize`

```json
{
  "attemptId": "string",
  "testId": "string",
  "clientId": "string",
  "ts": "2024-01-01T12:00:00.000Z",
  "timezone": "Europe/Minsk",
  "settings": {},
  "aggregates": {},
  "summary": {}
}
```

Ответ:

```json
{
  "status": "finalized",
  "attempt": {
    "attemptId": "string",
    "testId": "string",
    "clientId": "string",
    "createdAt": "2024-01-01T12:00:00+00:00",
    "finalizedAt": "2024-01-01T12:30:00+00:00",
    "aggregates": {},
    "summary": {}
  }
}
```

#### Админ: пересборка агрегатов из событий

`POST /api/attempts/{attemptId}/rebuild?admin=true`

Пересчитывает `aggregates` и `summary` на основе `events.ndjson`, если файл
с событиями ещё не удалён плановой очисткой.

### Очистка событий

Периодическое удаление старых `events.ndjson` настраивается через переменную
окружения `EVENTS_RETENTION_DAYS` (по умолчанию 30 дней). При значении `0` или
меньше очистка отключается.

## Docker

### Сборка и запуск

```bash
docker build -t bsu-test-master .
docker run --rm -p 8000:8000 -v "${PWD}/data:/app/data" bsu-test-master
```

### docker-compose

```bash
docker compose up --build
```

## CI/CD

GitHub Actions запускает:

- `pytest` с покрытием (`pytest-cov`) и порогом > 90%.
- После успешного merge в `main` выполняется деплой на PythonAnywhere через SSH.

## Конвертация WMF/EMF в PNG (Linux/PythonAnywhere)

По умолчанию в Linux/PythonAnywhere конвертация WMF/EMF через Pillow недоступна,
поэтому добавлена поддержка внешних конвертеров. Можно выбрать доступный инструмент,
указав порядок через переменную окружения `METAFILE_CONVERTERS`:

```bash
export METAFILE_CONVERTERS="soffice,inkscape,magick,convert"
```

Поддерживаемые значения:
- `soffice` или `libreoffice` (LibreOffice headless)
- `inkscape`
- `magick` или `convert` (ImageMagick)

Если внешний конвертер недоступен, приложение продолжит работу и пропустит конвертацию,
оставив исходный WMF/EMF.

## Деплой на PythonAnywhere

1. Создайте репозиторий приложения на PythonAnywhere и клонируйте `main`:

   ```bash
   git clone https://github.com/<org>/<repo>.git ~/projects/bsu-test-master
   ```

2. Создайте виртуальное окружение и установите зависимости:

   ```bash
   python3.11 -m venv ~/venvs/bsu-test-master
   ~/venvs/bsu-test-master/bin/pip install -r requirements.txt
   ```

3. При необходимости установите внешние инструменты (LibreOffice / Inkscape / ImageMagick)
   в окружении PythonAnywhere, чтобы работала конвертация WMF/EMF.

4. Настройте WSGI-файл и укажите путь к приложению (FastAPI через ASGI):

   ```python
   from api.app import app  # noqa
   ```

5. Укажите в GitHub Secrets параметры для автоматического деплоя (см. workflow):

   - `PA_SSH_HOST`, `PA_SSH_USER`, `PA_SSH_KEY`
   - `PA_APP_DIR` (путь к репозиторию на сервере)
   - `PA_VENV_BIN` (путь к `pip`/`python` внутри venv, например `~/venvs/bsu-test-master/bin`)
   - `PA_WSGI_FILE` (путь к WSGI-файлу, который нужно `touch` для перезагрузки)

После merge в `main` workflow обновит код, установит зависимости и перезагрузит приложение.

## Standalone (PyInstaller)

Сборка единого бинарника:

```bash
python -m pip install pyinstaller
pyinstaller pyinstaller.spec
```

Готовый бинарник лежит в `dist/bsu-test-master` (Windows: `dist/bsu-test-master.exe`).

Запуск без установленного Python и без интернета:

```bash
./dist/bsu-test-master
```

По умолчанию данные сохраняются рядом с бинарником в `data/tests/`. При необходимости
задайте путь через переменную окружения `TEST_DATA_DIR`.

## Ограничения контейнера

В Linux-контейнере недоступен COM-рендер формул через Microsoft Word: используются плейсхолдеры или альтернативный рендер (например, через LibreOffice/MathJax), если он предусмотрен логикой сервиса.
