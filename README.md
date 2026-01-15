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

- Импортировать тесты из `.doc`/`.docx`.
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

## Ограничения контейнера

В Linux-контейнере недоступен COM-рендер формул через Microsoft Word: используются плейсхолдеры или альтернативный рендер (например, через LibreOffice/MathJax), если он предусмотрен логикой сервиса.
