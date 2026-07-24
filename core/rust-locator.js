'use strict';

/**
 * core/rust-locator.js
 * ---------------------------------------------------------------------------
 * Finds Rust's config folder (.../steamapps/common/Rust/cfg) so we can read
 * and write client.cfg. Strategy:
 *   1. Locate the Steam base install (per-OS common paths + Windows registry).
 *   2. Parse libraryfolders.vdf to discover every Steam library on the machine
 *      (games are often on a different drive than Steam itself).
 *   3. Look for Rust (appid 252490) in each library.
 *   4. Fall back to a user-picked folder, which we normalise to the cfg dir.
 *
 * Pure Node (fs/os/path/child_process) — no third-party deps.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const RUST_APPID = '252490';

function exists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

/**
 * Candidate Steam base directories for the current platform.
 */
function steamBaseCandidates() {
  const home = os.homedir();
  const out = [];

  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    out.push(path.join(pf86, 'Steam'));
    out.push(path.join(pf, 'Steam'));
    out.push('C:\\Steam');
    // Common secondary-drive installs
    for (const drive of ['D', 'E', 'F', 'G']) {
      out.push(`${drive}:\\Steam`);
      out.push(`${drive}:\\SteamLibrary`);
      out.push(`${drive}:\\Program Files (x86)\\Steam`);
    }
    // Registry (most reliable when present)
    try {
      const reg = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const m = reg.match(/SteamPath\s+REG_SZ\s+(.+)/i);
      if (m) out.unshift(m[1].trim().replace(/\//g, '\\'));
    } catch (_) { /* registry not available */ }
  } else if (process.platform === 'darwin') {
    out.push(path.join(home, 'Library', 'Application Support', 'Steam'));
  } else {
    // Linux (incl. flatpak / snap variants)
    out.push(path.join(home, '.steam', 'steam'));
    out.push(path.join(home, '.local', 'share', 'Steam'));
    out.push(path.join(home, '.steam', 'root'));
    out.push(path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'));
    out.push(path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'));
  }

  // De-dupe, keep only existing dirs
  return [...new Set(out)].filter(isDir);
}

/**
 * Parse a libraryfolders.vdf and return all library base paths it lists.
 */
function parseLibraryFolders(vdfPath) {
  const libs = [];
  try {
    const txt = fs.readFileSync(vdfPath, 'utf8');
    const re = /"path"\s+"([^"]+)"/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
      libs.push(m[1].replace(/\\\\/g, '\\'));
    }
  } catch (_) { /* ignore */ }
  return libs;
}

/**
 * All Steam library roots, derived from every Steam base we can find.
 */
function allLibraryRoots() {
  const roots = new Set();
  for (const base of steamBaseCandidates()) {
    roots.add(base); // the base itself is always a library
    const vdfs = [
      path.join(base, 'steamapps', 'libraryfolders.vdf'),
      path.join(base, 'config', 'libraryfolders.vdf'),
    ];
    for (const vdf of vdfs) {
      if (exists(vdf)) {
        for (const lib of parseLibraryFolders(vdf)) roots.add(lib);
      }
    }
  }
  return [...roots].filter(isDir);
}

/**
 * Given a library root, the Rust paths underneath it.
 */
function rustPathsFor(libRoot) {
  const gamePath = path.join(libRoot, 'steamapps', 'common', 'Rust');
  const cfgDir = path.join(gamePath, 'cfg');
  const clientCfgPath = path.join(cfgDir, 'client.cfg');
  const manifest = path.join(libRoot, 'steamapps', `appmanifest_${RUST_APPID}.acf`);
  return { gamePath, cfgDir, clientCfgPath, manifest };
}

/**
 * Auto-detect a Rust install. Returns the first solid hit.
 */
function autoDetect() {
  const checked = [];
  for (const lib of allLibraryRoots()) {
    const p = rustPathsFor(lib);
    checked.push(p.gamePath);
    const hasManifest = exists(p.manifest);
    const hasGameDir = isDir(p.gamePath);
    if (hasManifest || hasGameDir) {
      return {
        detected: true,
        source: 'auto',
        libraryPath: lib,
        gamePath: p.gamePath,
        cfgDir: p.cfgDir,
        clientCfgPath: p.clientCfgPath,
        clientCfgExists: exists(p.clientCfgPath),
        cfgDirExists: isDir(p.cfgDir),
        checked,
      };
    }
  }
  return { detected: false, source: null, checked };
}

/**
 * Normalise a user-picked folder into a Rust cfg target. The user might pick
 * the cfg folder, the Rust folder, the Steam folder, or a library root — we
 * handle all of them.
 */
function resolveFromFolder(folder) {
  if (!folder || !isDir(folder)) {
    return { detected: false, reason: 'Folder does not exist.' };
  }
  const base = path.basename(folder).toLowerCase();

  // 1) They picked the cfg folder directly (or any folder already holding client.cfg)
  if (base === 'cfg' || exists(path.join(folder, 'client.cfg'))) {
    return finalizeCfgDir(folder, 'manual');
  }
  // 2) They picked the Rust game folder
  if (isDir(path.join(folder, 'cfg')) || base === 'rust') {
    return finalizeCfgDir(path.join(folder, 'cfg'), 'manual');
  }
  // 3) They picked something containing steamapps/common/Rust (Steam root / library root)
  const nestedRust = path.join(folder, 'steamapps', 'common', 'Rust', 'cfg');
  if (isDir(path.join(folder, 'steamapps', 'common', 'Rust'))) {
    return finalizeCfgDir(nestedRust, 'manual');
  }
  // 4) Last resort: treat the chosen folder as the cfg dir (we'll create client.cfg in it)
  return finalizeCfgDir(folder, 'manual');
}

function finalizeCfgDir(cfgDir, source) {
  const clientCfgPath = path.join(cfgDir, 'client.cfg');
  const gamePath = path.basename(cfgDir).toLowerCase() === 'cfg' ? path.dirname(cfgDir) : null;
  return {
    detected: true,
    source,
    gamePath,
    cfgDir,
    clientCfgPath,
    clientCfgExists: exists(clientCfgPath),
    cfgDirExists: isDir(cfgDir),
  };
}

module.exports = {
  RUST_APPID,
  autoDetect,
  resolveFromFolder,
  allLibraryRoots,
  steamBaseCandidates,
  rustPathsFor,
};
