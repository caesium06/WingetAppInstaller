const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Uncomment for DevTools during development:
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.handle('window:minimize',   () => mainWindow.minimize());
ipcMain.handle('window:maximize',   () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.handle('window:close',      () => mainWindow.close());
ipcMain.handle('window:isMaximized',() => mainWindow.isMaximized());

// ── Winget helpers ────────────────────────────────────────────────────────────
function runWinget(args) {
  return new Promise((resolve, reject) => {
    exec(`winget ${args}`, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(stderr || err.message);
      resolve(stdout);
    });
  });
}

/**
 * Spawn winget with streaming stdout/stderr back to renderer.
 * Resolves with { ok, code, output } when the process exits.
 */
function spawnWinget(args, progressEvent, doneEvent, id) {
  return new Promise((resolve) => {
    const child = spawn('winget', args);
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      mainWindow.webContents.send(progressEvent, { id, text: data.toString() });
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
      mainWindow.webContents.send(progressEvent, { id, text: data.toString() });
    });
    child.on('close', (code) => {
      const success = code === 0;
      mainWindow.webContents.send(doneEvent, { id, success, output });
      resolve({ ok: success, code, output });
    });
  });
}

/**
 * Parse winget tabular output (search / list / upgrade) into objects.
 * Detects columns dynamically from the header line.
 */
function parseWingetTable(raw) {
  const lines = raw.split('\n').map(l => l.trimEnd());

  const sepIdx = lines.findIndex(l => /^[-─]+/.test(l));
  if (sepIdx < 1) return [];

  const headerLine = lines[sepIdx - 1];

  // Detect all known columns
  const knownCols = ['Name', 'Id', 'Version', 'Available', 'Match', 'Source'];
  const columns = [];
  for (const col of knownCols) {
    const idx = headerLine.indexOf(col);
    if (idx !== -1) columns.push({ name: col, start: idx });
  }
  columns.sort((a, b) => a.start - b.start);

  const results = [];
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const obj = {};
    for (let c = 0; c < columns.length; c++) {
      const start = columns[c].start;
      const end   = c + 1 < columns.length ? columns[c + 1].start : undefined;
      obj[columns[c].name] = (line.slice(start, end) || '').trim();
    }

    if (obj.Name || obj.Id) results.push(obj);
  }

  return results;
}

/**
 * Parse `winget show --versions` output into a plain string[].
 */
function parseVersionList(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const sepIdx = lines.findIndex(l => /^[-─]+/.test(l));
  if (sepIdx < 0) return [];
  return lines.slice(sepIdx + 1).filter(l => l && !/^\s*$/.test(l));
}

// ── IPC: Search ────────────────────────────────────────────────────────────
ipcMain.handle('winget:search', async (_event, query) => {
  try {
    const raw = await runWinget(`search "${query}" -n 40 --accept-source-agreements`);
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Install (streaming, optional version) ─────────────────────────────
ipcMain.handle('winget:install', (_event, id, version) => {
  const args = [
    'install', '--id', id,
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--silent',
  ];
  if (version) args.push('--version', version);
  return spawnWinget(args, 'install:progress', 'install:done', id);
});

// ── IPC: Uninstall (streaming) ─────────────────────────────────────────────
ipcMain.handle('winget:uninstall', (_event, id) => {
  const args = [
    'uninstall', '--id', id,
    '--silent',
    '--accept-source-agreements',
  ];
  return spawnWinget(args, 'uninstall:progress', 'uninstall:done', id);
});

// ── IPC: Upgrade / Update (streaming) ─────────────────────────────────────
ipcMain.handle('winget:upgrade', (_event, id) => {
  const args = [
    'upgrade', '--id', id,
    '--silent',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ];
  return spawnWinget(args, 'upgrade:progress', 'upgrade:done', id);
});

// ── IPC: List upgradable apps ──────────────────────────────────────────────
ipcMain.handle('winget:upgradable', async () => {
  try {
    const raw = await runWinget('upgrade --accept-source-agreements');
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Get available versions for an app ─────────────────────────────────
ipcMain.handle('winget:versions', async (_event, id) => {
  try {
    const raw = await runWinget(`show --id "${id}" --versions --accept-source-agreements`);
    return { ok: true, data: parseVersionList(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Installed app list ────────────────────────────────────────────────
ipcMain.handle('winget:list', async () => {
  try {
    const raw = await runWinget('list --accept-source-agreements');
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Featured / trending ───────────────────────────────────────────────
ipcMain.handle('winget:featured', async () => {
  const queries = ['browser', 'player', 'editor', 'git', 'vscode'];
  const pick = queries[Math.floor(Math.random() * queries.length)];
  try {
    const raw = await runWinget(`search "${pick}" -n 6 --accept-source-agreements`);
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
