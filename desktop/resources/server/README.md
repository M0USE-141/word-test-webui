# Backend binary

Сборка бэкенда в автономный бинарник (PyInstaller):

## Зависимости для PyInstaller

Перед сборкой убедитесь, что установлены зависимости из проекта:

```bash
pip install fastapi uvicorn python-multipart python-docx lxml pywin32
```

Если используется обработка изображений (Pillow), добавьте:

```bash
pip install Pillow
```

## Команда сборки

```bash
pyinstaller --onefile desktop/server_entry.py --name bsu-test-server --distpath desktop/resources/server --hidden-import uvicorn
```

В production Electron ищет бинарник в `resources/server/bsu-test-server(.exe)`.
