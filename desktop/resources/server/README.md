# Backend binary

Сборка бэкенда в автономный бинарник (PyInstaller):

```bash
pyinstaller --onefile desktop/server_entry.py --name bsu-test-server --distpath desktop/resources/server
```

В production Electron ищет бинарник в `resources/server/bsu-test-server(.exe)`.
