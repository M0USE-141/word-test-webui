# Backend binary

Сборка бэкенда в автономный бинарник (PyInstaller):

```bash
pyinstaller --onefile desktop/server_entry.py --name bsu-test-server --distpath desktop/resources/server --hidden-import uvicorn
```

В production Electron ищет бинарник в `resources/server/bsu-test-server(.exe)`.
