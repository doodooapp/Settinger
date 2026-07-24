'use strict';

/**
 * main.js — Settinger Electron main process.
 * Owns the window and every privileged operation (filesystem, hardware probe,
 * process check). The renderer talks to it only through the typed bridge in
 * preload.js; it has no direct Node access.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { getSpecs } = require('./core/specs');
const locator = require('./core/rust-locator');
const { parseClientCfg, mergeClientCfg } = require('./core/rust-config');
const { PRESETS } = require('./core/rust-presets');

// --------------------------------------------------------------------------
// Tiny JSON settings store in the per-user app data directory.
// --------------------------------------------------------------------------
function storePath() {
  return path.join(app.getPath('userData'), 'settinger.json');
}
function loadStore() {
  try { return JSON.parse(fs.readFileSync(storePath(), 'utf8')); } catch (_) { return {}; }
}
function saveStore(data) {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
    return true;
  } catch (_) { return false; }
}

function backupDir() {
  return path.join(app.getPath('userData'), 'backups', 'rust');
}

// --------------------------------------------------------------------------
// Window
// --------------------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#0E0F13',
    show: false,
    autoHideMenuBar: true,
    title: 'Settinger',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload requires Node built-ins via the core modules
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
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

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Resolve the Rust cfg target: manual override first, else auto-detect. */
function resolveRustTarget() {
  const store = loadStore();
  if (store.rustCfgDir && fs.existsSync(store.rustCfgDir)) {
    return locator.resolveFromFolder(store.rustCfgDir);
  }
  return locator.autoDetect();
}

/** Best-effort check whether the Rust client is currently running. */
function isRustRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq RustClient.exe" /NH', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      return /RustClient\.exe/i.test(out);
    }
    const out = execSync('ps -A', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return /RustClient|\bRust\b/i.test(out);
  } catch (_) {
    return false; // if we can't tell, don't block the user
  }
}

// --------------------------------------------------------------------------
// IPC: system specs
// --------------------------------------------------------------------------
ipcMain.handle('specs:get', async () => {
  try {
    return { ok: true, specs: await getSpecs() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --------------------------------------------------------------------------
// IPC: Rust detection / path management
// --------------------------------------------------------------------------
ipcMain.handle('rust:status', async () => {
  const target = resolveRustTarget();
  return {
    ...target,
    running: isRustRunning(),
    backupsDir: backupDir(),
  };
});

ipcMain.handle('rust:browse', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Locate your Rust folder (or its cfg folder)',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { detected: false, canceled: true };
  const resolved = locator.resolveFromFolder(res.filePaths[0]);
  if (resolved.detected) {
    const store = loadStore();
    store.rustCfgDir = resolved.cfgDir;
    saveStore(store);
  }
  return resolved;
});

ipcMain.handle('rust:clearPath', async () => {
  const store = loadStore();
  delete store.rustCfgDir;
  saveStore(store);
  return resolveRustTarget();
});

ipcMain.handle('rust:openCfgFolder', async () => {
  const target = resolveRustTarget();
  if (target.detected && target.cfgDir && fs.existsSync(target.cfgDir)) {
    shell.openPath(target.cfgDir);
    return { ok: true };
  }
  return { ok: false, error: 'cfg folder not found yet' };
});

ipcMain.handle('rust:openBackupsFolder', async () => {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    shell.openPath(backupDir());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --------------------------------------------------------------------------
// IPC: read current client.cfg values (for "current vs preset" display)
// --------------------------------------------------------------------------
ipcMain.handle('rust:readConfig', async () => {
  const target = resolveRustTarget();
  if (!target.detected) return { ok: false, error: 'Rust not located' };
  try {
    const text = target.clientCfgExists ? fs.readFileSync(target.clientCfgPath, 'utf8') : '';
    return { ok: true, values: parseClientCfg(text).values, exists: target.clientCfgExists };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --------------------------------------------------------------------------
// IPC: apply a preset (with automatic backup)
// --------------------------------------------------------------------------
ipcMain.handle('rust:applyPreset', async (_evt, presetId) => {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ok: false, error: `Unknown preset: ${presetId}` };

  const target = resolveRustTarget();
  if (!target.detected) {
    return { ok: false, error: 'Rust install not found. Use "Locate Rust folder" first.' };
  }

  try {
    fs.mkdirSync(target.cfgDir, { recursive: true });
    const existingText = fs.existsSync(target.clientCfgPath)
      ? fs.readFileSync(target.clientCfgPath, 'utf8')
      : '';

    // Backups -----------------------------------------------------------
    let backupPath = null;
    if (existingText.length > 0) {
      fs.mkdirSync(backupDir(), { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(backupDir(), `client.cfg.${ts}.bak`);
      fs.writeFileSync(backupPath, existingText);

      // Keep one pristine "original" the very first time we ever touch it.
      const originalPath = path.join(backupDir(), 'client.cfg.ORIGINAL.bak');
      if (!fs.existsSync(originalPath)) fs.writeFileSync(originalPath, existingText);
    }

    // Merge + write -----------------------------------------------------
    const { text, changed, added, unchanged } = mergeClientCfg(existingText, preset.convars, {
      presetLabel: preset.name,
    });
    fs.writeFileSync(target.clientCfgPath, text);

    return {
      ok: true,
      presetId,
      presetName: preset.name,
      clientCfgPath: target.clientCfgPath,
      backupPath,
      changedCount: changed.length,
      addedCount: added.length,
      unchangedCount: unchanged.length,
      running: isRustRunning(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --------------------------------------------------------------------------
// IPC: restore the most recent (or original) backup
// --------------------------------------------------------------------------
ipcMain.handle('rust:restore', async (_evt, which) => {
  const target = resolveRustTarget();
  if (!target.detected) return { ok: false, error: 'Rust not located' };
  try {
    const dir = backupDir();
    if (!fs.existsSync(dir)) return { ok: false, error: 'No backups exist yet' };

    let chosen;
    if (which === 'original') {
      chosen = path.join(dir, 'client.cfg.ORIGINAL.bak');
      if (!fs.existsSync(chosen)) return { ok: false, error: 'No original backup found' };
    } else {
      const backups = fs.readdirSync(dir)
        .filter((f) => /^client\.cfg\..*\.bak$/.test(f) && !f.includes('ORIGINAL'))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (!backups.length) return { ok: false, error: 'No backups exist yet' };
      chosen = path.join(dir, backups[0].f);
    }

    fs.copyFileSync(chosen, target.clientCfgPath);
    return { ok: true, restoredFrom: chosen, clientCfgPath: target.clientCfgPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
