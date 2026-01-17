# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None
project_root = Path(SPECPATH)

datas = [
    (str(project_root / "static"), "static"),
    (str(project_root / "templates"), "templates"),
    (str(project_root / "omml2mml.xsl"), "."),
]

hiddenimports = []
hiddenimports += collect_submodules("fastapi")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("python_multipart")
hiddenimports += collect_submodules("starlette")

a = Analysis(
    ["run_app.py"],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="bsu-test-master",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name="bsu-test-master",
)
