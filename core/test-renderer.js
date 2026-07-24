'use strict';

/**
 * core/test-renderer.js
 * ---------------------------------------------------------------------------
 * Headless smoke + behaviour test for the renderer (app.js). The real UI runs
 * in Electron's Chromium, which we can't open in CI/sandbox, so we mount the
 * actual app.html body in jsdom, inject the real data + logic scripts, mock the
 * `window.settinger` bridge, and assert the rendered DOM and apply/restore flows.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

(async function run() {
  console.log('\nRenderer tests (jsdom)\n' + '-'.repeat(40));

  // Real markup, minus the external <script>/<link> tags (jsdom won't fetch them).
  let html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.html'), 'utf8');
  html = html.replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, '');

  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.confirm = () => true; // auto-accept restore/apply confirmations

  // Mock bridge --------------------------------------------------------------
  const calls = { applyPreset: [], restore: [], status: 0, specs: 0 };
  let rustRunning = false;
  let rustDetected = true;
  window.settinger = {
    getSpecs: async () => {
      calls.specs++;
      return {
        ok: true,
        specs: {
          generatedAt: new Date().toISOString(),
          tier: { tier: 'Elite', score: 110, suggested: 'max_quality' },
          cpu: { brand: 'AMD Ryzen 7 5800X', cores: 8, threads: 16, speed: '3.8 GHz', speedMax: '4.7 GHz' },
          gpus: [{ model: 'NVIDIA GeForce RTX 3080', vendor: 'NVIDIA', vramGB: 10 }],
          ram: { totalGB: 32, type: 'DDR4', speed: '3600 MHz', sticks: 2 },
          os: { name: 'Windows 11 Pro', arch: 'x64', build: '22631' },
          motherboard: { name: 'ASUS ROG STRIX B550-F' },
          storage: [{ name: 'Samsung 980 Pro', type: 'NVMe', sizeGB: 1000, interface: 'PCIe' }],
          displays: [{ resolution: '2560\u00d71440', refresh: '165 Hz', main: true }],
        },
      };
    },
    rust: {
      status: async () => {
        calls.status++;
        return rustDetected
          ? { detected: true, cfgDir: '/Steam/common/Rust/cfg', clientCfgPath: '/Steam/common/Rust/cfg/client.cfg', clientCfgExists: true, running: rustRunning, backupsDir: '/data/backups/rust' }
          : { detected: false };
      },
      browse: async () => ({ detected: true, cfgDir: '/picked/Rust/cfg', clientCfgPath: '/picked/Rust/cfg/client.cfg', clientCfgExists: false }),
      clearPath: async () => ({ detected: false }),
      readConfig: async () => ({ ok: true, values: {}, exists: true }),
      applyPreset: async (id) => {
        calls.applyPreset.push(id);
        return { ok: true, presetId: id, presetName: id, clientCfgPath: '/Steam/common/Rust/cfg/client.cfg', backupPath: '/data/backups/rust/client.cfg.bak', changedCount: 12, addedCount: 5, unchangedCount: 3, running: rustRunning };
      },
      restore: async (which) => { calls.restore.push(which); return { ok: true, restoredFrom: '/data/backups/rust/client.cfg.' + which + '.bak', clientCfgPath: '/Steam/common/Rust/cfg/client.cfg' }; },
      openCfgFolder: async () => ({ ok: true }),
      openBackupsFolder: async () => ({ ok: true }),
    },
  };

  // Inject the real scripts in load order.
  function inject(file) {
    const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const s = window.document.createElement('script');
    s.textContent = code;
    window.document.body.appendChild(s);
  }
  inject('renderer/games-data.js');
  inject('core/rust-presets.js');
  inject('renderer/app.js'); // IIFE runs now

  const doc = window.document;
  await tick(); // let async renderProfile resolve

  // ---- globals wired ----
  ok('games-data exposes window.GAMES', Array.isArray(window.GAMES) && window.GAMES.length > 10);
  ok('rust-presets exposes window.RUSTPRESETS', !!window.RUSTPRESETS && window.RUSTPRESETS.PRESETS.length === 3);

  // ---- sidebar ----
  const items = [...doc.querySelectorAll('.game-item')];
  ok('sidebar renders all games', items.length === window.GAMES.length);
  ok('Rust is pinned first in sidebar', items[0] && items[0].dataset.id === 'rust');
  ok('supported game shows ready dot', items[0].querySelector('.dot-ok') !== null);
  ok('unsupported game shows SOON tag', items.some((i) => i.querySelector('.soon')));

  // ---- profile (default view) ----
  ok('profile fetched specs once', calls.specs === 1);
  ok('rig-hero rendered', doc.querySelector('.rig-hero') !== null);
  ok('tier badge shows Elite', /Elite/.test(doc.querySelector('.tier-badge .t-name').textContent));
  ok('suggested preset name resolved (not raw id)', /Max Quality/.test(doc.querySelector('.rig-hero .suggest').textContent));
  const specCards = [...doc.querySelectorAll('.spec-card')];
  ok('spec cards rendered (>=6)', specCards.length >= 6);
  ok('CPU brand shown in a spec card', specCards.some((c) => /Ryzen 7 5800X/.test(c.textContent)));
  ok('GPU VRAM shown', specCards.some((c) => /10 GB/.test(c.textContent)));
  ok('display resolution shown', specCards.some((c) => /2560/.test(c.textContent)));
  ok('status chip shows ELITE RIG', /ELITE RIG/.test(doc.getElementById('status-chip').textContent));

  // ---- Rust view ----
  items[0].click();
  await tick(); // refreshRustStatus resolves
  const presetCards = [...doc.querySelectorAll('.preset')];
  ok('three preset cards in Rust view', presetCards.length === 3);
  ok('preset shows pills', doc.querySelector('.preset .pill') !== null);
  const table = doc.querySelector('.settings-table');
  ok('settings table rendered', table !== null);
  const convarRows = [...doc.querySelectorAll('.settings-table .convar')];
  ok('settings table lists every convar', convarRows.length === Object.keys(window.RUSTPRESETS.CONVARS).length);
  ok('settings table has 3 preset value columns', doc.querySelectorAll('.settings-table thead th').length === 5);
  ok('booleans render as On/Off', [...doc.querySelectorAll('.settings-table .val-cell')].some((c) => c.textContent === 'Off' || c.textContent === 'On'));
  ok('Rust detected notice shows path', /client\.cfg/.test(doc.getElementById('rust-status').textContent));
  ok('status chip shows Rust ready', /Rust ready/.test(doc.getElementById('status-chip').textContent));
  ok('suggested preset carries Recommended badge (from cached specs)',
    doc.querySelector('[data-preset-card="max_quality"] .rec-badge') !== null);
  ok('non-suggested presets carry no badge', doc.querySelectorAll('.rec-badge').length === 1);

  // ---- apply preset (not running) ----
  doc.querySelector('[data-apply="pvp"]').click();
  await tick(); await tick();
  ok('applyPreset called with pvp', calls.applyPreset.includes('pvp'));
  const okLog = doc.querySelector('#rust-log .log-line.ok');
  ok('success log line written', okLog !== null);
  ok('apply summary reports changed/added counts', /12 changed/.test(doc.getElementById('rust-log').textContent));
  ok('backup path logged', /client\.cfg\.bak/.test(doc.getElementById('rust-log').textContent));

  // ---- apply when Rust is running (should still proceed via confirm=true) ----
  rustRunning = true;
  calls.applyPreset.length = 0;
  doc.querySelector('[data-apply="max_performance"]').click();
  await tick(); await tick();
  ok('apply proceeds after running-warning confirm', calls.applyPreset.includes('max_performance'));
  ok('running heads-up logged as error line', doc.querySelectorAll('#rust-log .log-line.err').length >= 1);
  rustRunning = false;

  // ---- tools: restore ----
  [...doc.querySelectorAll('[data-tool]')].find((b) => b.dataset.tool === 'restore').click();
  await tick();
  ok('restore latest invoked', calls.restore.includes('latest'));
  [...doc.querySelectorAll('[data-tool]')].find((b) => b.dataset.tool === 'restoreorig').click();
  await tick();
  ok('restore original invoked', calls.restore.includes('original'));

  // ---- locate folder ----
  [...doc.querySelectorAll('[data-tool]')].find((b) => b.dataset.tool === 'locate').click();
  await tick(); await tick();
  ok('locate folder logs new path', /picked\/Rust\/cfg/.test(doc.getElementById('rust-log').textContent));

  // ---- not-detected state ----
  rustDetected = false;
  items[0].click();
  await tick();
  ok('not-detected shows locate guidance', /auto-detect/i.test(doc.getElementById('rust-status').textContent));
  ok('status chip shows not found', /not found/i.test(doc.getElementById('status-chip').textContent));
  rustDetected = true;

  // ---- search filter ----
  const search = doc.getElementById('search');
  search.value = 'tarkov';
  search.dispatchEvent(new window.Event('input'));
  await tick();
  const filtered = [...doc.querySelectorAll('.game-item')];
  ok('search narrows the list', filtered.length === 1 && /Tarkov/.test(filtered[0].textContent));
  search.value = '';
  search.dispatchEvent(new window.Event('input'));

  // ---- other game view ----
  [...doc.querySelectorAll('.game-item')].find((i) => i.dataset.id === 'cs2').click();
  await tick();
  ok('other game shows coming-soon info notice', /roadmap/i.test(doc.querySelector('.notice.info').textContent));
  ok('other game preset buttons are disabled', [...doc.querySelectorAll('.preset .btn')].every((b) => b.disabled));

  // ---- back to profile ----
  doc.getElementById('profile-btn').click();
  await tick();
  ok('profile button returns to spec sheet', doc.querySelector('.rig-hero') !== null);
  ok('specs served from cache on revisit (no refetch)', calls.specs === 1);

  console.log('-'.repeat(40));
  console.log('Result: ' + pass + ' passed, ' + fail + ' failed');
  console.log('-'.repeat(40) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Harness crashed:', e); process.exit(1); });
