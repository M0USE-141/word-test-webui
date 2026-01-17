const { app, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

let serverProcess = null;

const isDev = !app.isPackaged;
const baseDir = isDev ? __dirname : process.resourcesPath;
const defaultConfigPath = path.join(baseDir, "config.json");
const userConfigPath = path.join(app.getPath("userData"), "config.json");
const serverBinaryName = process.platform === "win32" ? "bsu-test-server.exe" : "bsu-test-server";
const serverBinaryPath = isDev
  ? path.join(__dirname, "resources", "server", serverBinaryName)
  : path.join(process.resourcesPath, "server", serverBinaryName);
const serverEntryPath = path.join(__dirname, "server_entry.py");
const pythonExecutable = process.env.BSU_PYTHON || process.env.PYTHON || "python";

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function loadConfig() {
  const defaults = readJson(defaultConfigPath) || {};
  const override = readJson(userConfigPath) || {};
  const config = { ...defaults, ...override };

  if (!config.lanToken && config.allowLan) {
    config.lanToken = crypto.randomBytes(12).toString("hex");
  }

  writeJson(userConfigPath, config);
  return config;
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return null;
}

function waitForPort(host, port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Server startup timed out"));
          return;
        }
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
}

async function confirmLanMode(config) {
  if (!config.allowLan) {
    return { allowLan: false, config };
  }

  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Включить LAN-режим", "Отключить"],
    defaultId: 1,
    cancelId: 1,
    message: "LAN-режим откроет доступ к тестам из локальной сети.",
    detail:
      "Включайте только если понимаете риски. Доступ можно ограничить токеном в URL.",
  });

  if (response !== 0) {
    config.allowLan = false;
    writeJson(userConfigPath, config);
    return { allowLan: false, config };
  }

  if (!config.lanToken) {
    config.lanToken = crypto.randomBytes(12).toString("hex");
    writeJson(userConfigPath, config);
  }

  return { allowLan: true, config };
}

function startServer({ host, port, token, dataDir }) {
  const env = {
    ...process.env,
    TEST_DATA_DIR: dataDir,
    BSU_LAN_TOKEN: token || "",
    BSU_LAN_ENABLED: token ? "true" : "false",
  };

  if (fs.existsSync(serverBinaryPath)) {
    serverProcess = childProcess.spawn(serverBinaryPath, [
      "--host",
      host,
      "--port",
      String(port),
      "--data-dir",
      dataDir,
    ], {
      env,
      stdio: "inherit",
    });
    return;
  }

  if (!isDev) {
    throw new Error(`Server binary not found: ${serverBinaryPath}`);
  }

  serverProcess = childProcess.spawn(pythonExecutable, [
    serverEntryPath,
    "--host",
    host,
    "--port",
    String(port),
    "--data-dir",
    dataDir,
  ], {
    env,
    stdio: "inherit",
  });
}

function buildUrl(host, port, token) {
  const url = new URL(`http://${host}:${port}/`);
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

async function showLanInfo(host, port, token) {
  if (!token) {
    return;
  }
  const url = buildUrl(host, port, token);
  await dialog.showMessageBox({
    type: "warning",
    buttons: ["ОК"],
    message: "LAN-режим включён",
    detail: `Ссылка для доступа из сети: ${url}\n\nЕсли порт занят или нужно изменить его, откройте ${userConfigPath} и укажите другой порт.`,
  });
}

async function run() {
  const config = loadConfig();
  const { allowLan, config: updatedConfig } = await confirmLanMode(config);
  const host = allowLan ? "0.0.0.0" : "127.0.0.1";
  const displayHost = allowLan ? getLocalIp() || "127.0.0.1" : "127.0.0.1";
  const port = Number(updatedConfig.port) || 8000;

  try {
    startServer({
      host,
      port,
      token: allowLan ? updatedConfig.lanToken : "",
      dataDir: updatedConfig.dataDir || "data/tests",
    });
    await waitForPort("127.0.0.1", port);
  } catch (error) {
    dialog.showErrorBox("Ошибка запуска сервера", error.message);
    app.quit();
    return;
  }

  if (allowLan) {
    await showLanInfo(displayHost, port, updatedConfig.lanToken);
  }

  const url = buildUrl(displayHost, port, allowLan ? updatedConfig.lanToken : "");
  await shell.openExternal(url);

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(run);

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
