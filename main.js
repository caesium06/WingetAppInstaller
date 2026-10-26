const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow;

// ── Persistent storage (userData) ─────────────────────────────────────────────
function getDataPath(file) {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(getDataPath(file), 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, data) {
  try { fs.writeFileSync(getDataPath(file), JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('writeJson', e); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1340,
    height:    860,
    minWidth:  960,
    minHeight: 640,
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

// ── Window controls ────────────────────────────────────────────────────────────
ipcMain.handle('window:minimize',    () => mainWindow.minimize());
ipcMain.handle('window:maximize',    () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.handle('window:close',       () => mainWindow.close());
ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

// ── Winget helpers ─────────────────────────────────────────────────────────────
function runWinget(args) {
  return new Promise((resolve, reject) => {
    exec(`winget ${args}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(stderr || err.message);
      resolve(stdout);
    });
  });
}

function spawnWinget(args, progressEvent, doneEvent, id) {
  return new Promise((resolve) => {
    const child = spawn('winget', args);
    let output = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send(progressEvent, { id, text });
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send(progressEvent, { id, text });
    });
    child.on('close', (code) => {
      const success = code === 0;
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send(doneEvent, { id, success, output });
      resolve({ ok: success, code, output });
    });
  });
}

function parseWingetTable(raw) {
  const lines  = raw.split('\n').map(l => l.trimEnd());
  const sepIdx = lines.findIndex(l => /^[-─]+/.test(l));
  if (sepIdx < 1) return [];

  const headerLine = lines[sepIdx - 1];
  const knownCols  = ['Name', 'Id', 'Version', 'Available', 'Match', 'Source'];
  const columns    = [];

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

function parseVersionList(raw) {
  const lines  = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const sepIdx = lines.findIndex(l => /^[-─]+/.test(l));
  if (sepIdx < 0) return [];
  return lines.slice(sepIdx + 1).filter(l => l && !/^\s*$/.test(l));
}

function parseShowOutput(raw) {
  const meta  = {};
  const lines = raw.split('\n');
  for (const line of lines) {
    const m = line.match(/^([\w\s\/\-]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/[\s\-\/]+/g, '_');
    meta[key] = m[2].trim();
  }
  return meta;
}

// ── Operation History ──────────────────────────────────────────────────────────
const HISTORY_FILE = 'history.json';
const MAX_HISTORY  = 200;

function appendHistory(entry) {
  const hist = readJson(HISTORY_FILE, []);
  hist.unshift({ ...entry, timestamp: new Date().toISOString() });
  writeJson(HISTORY_FILE, hist.slice(0, MAX_HISTORY));
}

ipcMain.handle('history:get',   () => readJson(HISTORY_FILE, []));
ipcMain.handle('history:clear', () => writeJson(HISTORY_FILE, []));

// ── App Bundles ────────────────────────────────────────────────────────────────
const BUNDLES_FILE = 'bundles.json';
ipcMain.handle('bundles:get',  ()            => readJson(BUNDLES_FILE, []));
ipcMain.handle('bundles:save', (_, bundles)  => { writeJson(BUNDLES_FILE, bundles); return true; });

// ── IPC: Search ────────────────────────────────────────────────────────────────
ipcMain.handle('winget:search', async (_e, query) => {
  if (!query || query.length > 120) return { ok: false, error: 'Invalid query' };
  try {
    const raw = await runWinget(`search "${query}" -n 50 --accept-source-agreements`);
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Show (package metadata) ──────────────────────────────────────────────
ipcMain.handle('winget:show', async (_e, id) => {
  if (!id || id.length > 200) return { ok: false, error: 'Invalid id' };
  try {
    const raw = await runWinget(`show --id "${id}" --accept-source-agreements`);
    return { ok: true, data: parseShowOutput(raw), raw };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Install ───────────────────────────────────────────────────────────────
ipcMain.handle('winget:install', async (_e, id, version) => {
  const args = ['install', '--id', id, '--accept-package-agreements', '--accept-source-agreements', '--silent'];
  if (version) args.push('--version', version);
  const result = await spawnWinget(args, 'install:progress', 'install:done', id);
  appendHistory({ op: 'install', id, version: version || 'latest', ok: result.ok });
  return result;
});

// ── IPC: Uninstall ─────────────────────────────────────────────────────────────
ipcMain.handle('winget:uninstall', async (_e, id) => {
  const args = ['uninstall', '--id', id, '--silent', '--accept-source-agreements'];
  const result = await spawnWinget(args, 'uninstall:progress', 'uninstall:done', id);
  appendHistory({ op: 'uninstall', id, ok: result.ok });
  return result;
});

// ── IPC: Upgrade individual ────────────────────────────────────────────────────
ipcMain.handle('winget:upgrade', async (_e, id) => {
  const args = ['upgrade', '--id', id, '--silent', '--accept-package-agreements', '--accept-source-agreements'];
  const result = await spawnWinget(args, 'upgrade:progress', 'upgrade:done', id);
  appendHistory({ op: 'upgrade', id, ok: result.ok });
  return result;
});

// ── IPC: List upgradable ───────────────────────────────────────────────────────
ipcMain.handle('winget:upgradable', async () => {
  try {
    const raw = await runWinget('upgrade --accept-source-agreements');
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Available versions ────────────────────────────────────────────────────
ipcMain.handle('winget:versions', async (_e, id) => {
  try {
    const raw = await runWinget(`show --id "${id}" --versions --accept-source-agreements`);
    return { ok: true, data: parseVersionList(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Installed list ────────────────────────────────────────────────────────
ipcMain.handle('winget:list', async () => {
  try {
    const raw = await runWinget('list --accept-source-agreements');
    return { ok: true, data: parseWingetTable(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Featured / category browse ───────────────────────────────────────────
const FEATURED_CATEGORIES = [
  'browser', 'media player', 'developer tools', 'git',
  'office', 'utility', 'communication', 'image editor',
];
let featuredIdx = 0;

ipcMain.handle('winget:featured', async (_e, query) => {
  const pick = query || FEATURED_CATEGORIES[featuredIdx++ % FEATURED_CATEGORIES.length];
  try {
    const raw = await runWinget(`search "${pick}" -n 12 --accept-source-agreements`);
    return { ok: true, data: parseWingetTable(raw), category: pick };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
