'use strict';

/**
 * renderer/app.js
 * ---------------------------------------------------------------------------
 * All UI logic for the Settinger app shell. Talks to the main process only
 * through the `window.settinger` bridge exposed by preload.js — it has no
 * direct filesystem or Node access.
 *
 * Views:
 *   - Profile  : a hardware spec-sheet + derived "rig tier" and suggested preset.
 *   - Rust     : fully wired — three presets write straight to client.cfg, with
 *                detection, backup/restore tools and a per-preset settings table.
 *   - Other    : a clear, honest "auto-apply coming soon" state.
 * ---------------------------------------------------------------------------
 */

(function () {
  const api = window.settinger || null; // null when opened outside Electron
  const GAMES = window.GAMES || [];
  const { CONVARS = {}, CATEGORY_ORDER = [], PRESETS = [] } = window.RUSTPRESETS || {};

  // Quick id -> name map for preset suggestions.
  const PRESET_NAME = PRESETS.reduce((m, p) => ((m[p.id] = p.name), m), {});

  // ----- DOM refs -----
  const $list = document.getElementById('game-list');
  const $content = document.getElementById('content');
  const $search = document.getElementById('search');
  const $profileBtn = document.getElementById('profile-btn');
  const $profileAvatar = document.getElementById('profile-avatar');
  const $profileSub = document.getElementById('profile-sub');
  const $crumb = document.getElementById('crumb');
  const $title = document.getElementById('view-title');
  const $chip = document.getElementById('status-chip');
  const $chipText = document.getElementById('status-text');

  // ----- view state -----
  let view = { type: 'profile' };
  let specsCache = null; // last good specs object

  // =========================================================================
  // Icons (lucide-style, inherit color via currentColor)
  // =========================================================================
  const I = {
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
    gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2.4"/><circle cx="15" cy="12" r="2.4"/><path d="M19 9v6"/>',
    ram: '<rect x="2" y="8" width="20" height="9" rx="1.5"/><path d="M6 8v9M10 8v9M14 8v9M18 8v9M4 20h4M16 20h4"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v4M15 17v4M3 9h4M17 15h4"/><circle cx="9" cy="15" r="1.6"/><circle cx="15" cy="9" r="1.6"/><path d="M15 10.6V13"/>',
    drive: '<rect x="3" y="13" width="18" height="6" rx="2"/><path d="M5 13l2-7h10l2 7"/><circle cx="17.5" cy="16" r="1"/>',
    os: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3 6 9l6 12 6-12-3-6"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.6"/>',
    hex: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
    warn: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>',
  };
  function svg(name, cls) {
    return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;
  }

  // =========================================================================
  // Helpers
  // =========================================================================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function monogram(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
  function setChip(state, text) {
    $chip.className = 'chip' + (state ? ' ' + state : '');
    $chipText.textContent = text;
  }
  // Boolean/number -> human label for the settings UI.
  function valLabel(v) {
    if (v === true) return 'On';
    if (v === false) return 'Off';
    return String(v);
  }
  const AA_LABEL = { 0: 'Off', 1: 'FXAA', 2: 'SMAA', 3: 'TSSAA' };

  // =========================================================================
  // Sidebar
  // =========================================================================
  function renderSidebar(filter) {
    const q = (filter || '').trim().toLowerCase();
    let games = GAMES;
    if (q) games = GAMES.filter((g) => g.name.toLowerCase().includes(q) || (g.genre || '').toLowerCase().includes(q));

    // Keep Rust pinned to the top whenever it's present in the filtered set.
    games = games.slice().sort((a, b) => (a.id === 'rust' ? -1 : b.id === 'rust' ? 1 : 0));

    $list.innerHTML = '';
    if (!games.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.padding = '14px 12px';
      empty.textContent = 'No games match “' + (filter || '') + '”.';
      $list.appendChild(empty);
      return;
    }

    for (const g of games) {
      const btn = document.createElement('button');
      btn.className = 'game-item' + (view.type === 'game' && view.id === g.id ? ' active' : '');
      btn.dataset.id = g.id;
      btn.innerHTML =
        `<span class="badge" style="background:${esc(g.accent)}">${monogram(g.name)}</span>` +
        `<span class="game-meta"><span class="game-name">${esc(g.name)}</span>` +
        `<span class="game-genre">${esc(g.genre || '')}</span></span>` +
        (g.supported ? '<span class="dot-ok" title="Fully supported"></span>' : '<span class="soon">SOON</span>');
      btn.addEventListener('click', () => selectGame(g.id));
      $list.appendChild(btn);
    }
  }

  function markActive() {
    document.querySelectorAll('.game-item').forEach((el) =>
      el.classList.toggle('active', view.type === 'game' && el.dataset.id === view.id)
    );
    $profileBtn.classList.toggle('active', view.type === 'profile');
  }

  // =========================================================================
  // Router
  // =========================================================================
  function selectGame(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    view = { type: 'game', id };
    markActive();
    $crumb.textContent = 'GAMES';
    $title.textContent = g.name;
    if (g.id === 'rust') renderRust(g);
    else renderOtherGame(g);
  }

  function showProfile() {
    view = { type: 'profile' };
    markActive();
    $crumb.textContent = 'SETTINGER';
    $title.textContent = 'Profile';
    renderProfile();
  }

  // =========================================================================
  // Profile view — hardware spec sheet
  // =========================================================================
  function specCard(icon, title, value, rows) {
    const rowsHtml = (rows || [])
      .filter((r) => r && r.v != null && r.v !== '')
      .map((r) => `<div class="sc-row"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span></div>`)
      .join('');
    const valueHtml = value != null && value !== ''
      ? `<div class="sc-value">${esc(value)}</div>`
      : `<div class="muted">Not detected</div>`;
    return (
      `<div class="spec-card"><div class="sc-head">${svg(icon, 'sc-icon')}` +
      `<span class="sc-title">${esc(title)}</span></div>${valueHtml}` +
      (rowsHtml ? `<div class="sc-rows">${rowsHtml}</div>` : '') +
      `</div>`
    );
  }

  function profileSkeleton() {
    const cards = Array.from({ length: 6 })
      .map(() => '<div class="spec-card"><div class="skel" style="height:13px;width:40%;margin-bottom:12px"></div>' +
        '<div class="skel" style="height:18px;width:75%;margin-bottom:14px"></div>' +
        '<div class="skel" style="height:11px;width:90%;margin-bottom:7px"></div>' +
        '<div class="skel" style="height:11px;width:60%"></div></div>')
      .join('');
    $content.innerHTML =
      '<div class="view"><div class="rig-hero">' +
      '<div class="skel" style="width:92px;height:104px;flex:none;border-radius:14px"></div>' +
      '<div style="flex:1"><div class="skel" style="height:20px;width:46%;margin-bottom:10px"></div>' +
      '<div class="skel" style="height:13px;width:70%"></div></div></div>' +
      '<div class="spec-grid">' + cards + '</div></div>';
  }

  async function renderProfile() {
    // Hardware is static within a session, and probing it spins up slow WMI
    // queries on Windows — so probe once, then serve instantly from cache.
    if (specsCache) {
      paintProfile(specsCache);
      return;
    }

    setChip('', 'Reading hardware…');
    profileSkeleton();

    if (!api) {
      setChip('warn', 'No bridge');
      $content.innerHTML =
        '<div class="view"><div class="notice"><span class="ni">' + svg('warn') + '</span>' +
        '<div>Hardware detection needs the desktop runtime. Launch with <b>npm start</b> (Electron) ' +
        'to read your specs and write game configs.</div></div></div>';
      return;
    }

    try {
      const res = await api.getSpecs();
      if (!res || !res.ok) throw new Error((res && res.error) || 'Spec read failed');
      specsCache = res.specs;
      paintProfile(res.specs);
    } catch (err) {
      setChip('bad', 'Spec error');
      $content.innerHTML =
        '<div class="view"><div class="notice" style="border-left-color:var(--bad)"><span class="ni">' +
        svg('x') + '</span><div>Couldn’t read hardware specs: ' + esc(err.message) + '</div></div></div>';
    }
  }

  function paintProfile(s) {
    const cpu = s.cpu || {};
    const gpu = (s.gpus && s.gpus[0]) || {};
    const ram = s.ram || {};
    const os = s.os || {};
    const tier = s.tier || {};
    const disp = (s.displays || []).find((d) => d.main) || (s.displays || [])[0];

    // Sidebar avatar reflects tier initial.
    $profileAvatar.textContent = (tier.tier || 'PC').slice(0, 2).toUpperCase();
    $profileSub.textContent = tier.tier ? tier.tier + ' tier' : 'View specs';
    setChip('ok', (tier.tier ? tier.tier.toUpperCase() : 'RIG') + ' RIG');

    const suggestName = PRESET_NAME[tier.suggested] || '—';
    const heroSub = [gpu.model, ram.totalGB ? ram.totalGB + ' GB RAM' : null, os.name]
      .filter(Boolean).join('  ·  ');

    // CPU clock string (base / boost).
    const clock = cpu.speed
      ? cpu.speed + (cpu.speedMax && cpu.speedMax !== cpu.speed ? ' → ' + cpu.speedMax : '')
      : null;

    // Cards ----------------------------------------------------------------
    const cards = [];
    cards.push(specCard('cpu', 'Processor', cpu.brand, [
      { k: 'Cores', v: cpu.cores }, { k: 'Threads', v: cpu.threads }, { k: 'Clock', v: clock },
    ]));

    const gpuRows = [{ k: 'VRAM', v: gpu.vramGB ? gpu.vramGB + ' GB' : null }, { k: 'Vendor', v: gpu.vendor }];
    (s.gpus || []).slice(1).forEach((g, i) => gpuRows.push({ k: 'GPU ' + (i + 2), v: g.model }));
    cards.push(specCard('gpu', 'Graphics', gpu.model, gpuRows));

    cards.push(specCard('ram', 'Memory', ram.totalGB ? ram.totalGB + ' GB' : null, [
      { k: 'Type', v: ram.type }, { k: 'Speed', v: ram.speed }, { k: 'Modules', v: ram.sticks },
    ]));

    cards.push(specCard('monitor', 'Display', disp ? disp.resolution : null, [
      { k: 'Refresh', v: disp && disp.refresh }, { k: 'Screens', v: (s.displays || []).length || null },
    ]));

    const storage = s.storage || [];
    const storageRows = storage.slice(0, 4).map((d) => ({
      k: [d.type, d.interface].filter(Boolean).join(' ') || 'Disk',
      v: d.sizeGB ? d.sizeGB + ' GB' : null,
    }));
    cards.push(specCard('drive', 'Storage',
      storage.length ? storage.length + (storage.length === 1 ? ' drive' : ' drives') : null, storageRows));

    cards.push(specCard('os', 'Operating System', os.name, [
      { k: 'Architecture', v: os.arch }, { k: 'Build', v: os.build },
    ]));

    if (s.motherboard && s.motherboard.name && s.motherboard.name !== 'Unknown') {
      cards.push(specCard('board', 'Motherboard', s.motherboard.name, []));
    }

    $content.innerHTML =
      '<div class="view">' +
      '<div class="rig-hero">' +
        '<div class="tier-badge"><div class="inner"><div>' +
          '<div class="t-label">TIER</div><div class="t-name">' + esc(tier.tier || '—') + '</div>' +
        '</div></div></div>' +
        '<div class="hero-body">' +
          '<h2>' + esc(cpu.brand || 'Your Rig') + '</h2>' +
          '<div class="sub">' + esc(heroSub || 'Hardware summary') + '</div>' +
          '<div class="suggest">' + svg('hex', '') +
            ' Suggested Rust preset: <b>' + esc(suggestName) + '</b>' +
            (tier.score ? ' &nbsp;·&nbsp; score ' + esc(tier.score) : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="spec-grid">' + cards.join('') + '</div>' +
      '</div>';
  }

  // =========================================================================
  // Rust view — the fully wired game
  // =========================================================================
  const PRESET_ICON = { max_performance: 'zap', max_quality: 'gem', pvp: 'crosshair' };

  function presetPills(convars) {
    const pills = [];
    if ('graphics.quality' in convars) pills.push('Quality ' + convars['graphics.quality']);
    if ('effects.aa' in convars) pills.push('AA ' + (AA_LABEL[convars['effects.aa']] ?? convars['effects.aa']));
    if ('grass.quality' in convars) pills.push('Grass ' + convars['grass.quality']);
    if ('graphics.drawdistance' in convars) pills.push('Draw ' + convars['graphics.drawdistance']);
    if ('fps.limit' in convars) pills.push('FPS ' + (Number(convars['fps.limit']) === 0 ? '∞' : convars['fps.limit']));
    return pills.map((p) => '<span class="pill">' + esc(p) + '</span>').join('');
  }

  function presetCard(p) {
    return (
      '<div class="preset" style="--p-accent:' + esc(p.accent) + '">' +
      svg(PRESET_ICON[p.id] || 'sliders', 'p-icon') +
      '<h3>' + esc(p.name) + '</h3>' +
      '<div class="p-tag">' + esc(p.tagline) + '</div>' +
      '<div class="p-blurb">' + esc(p.blurb) + '</div>' +
      '<div class="p-stats">' + presetPills(p.convars) + '</div>' +
      '<div class="p-actions">' +
        '<button class="btn primary" data-apply="' + esc(p.id) + '">Apply preset</button>' +
      '</div></div>'
    );
  }

  function settingsTable() {
    // Header
    let rows =
      '<thead><tr><th>Setting</th><th>Convar</th>' +
      PRESETS.map((p) => '<th style="text-align:center">' + esc(p.name) + '</th>').join('') +
      '</tr></thead><tbody>';

    const valClass = ['val-perf', 'val-qual', 'val-pvp'];

    for (const cat of CATEGORY_ORDER) {
      const keys = Object.keys(CONVARS).filter((k) => CONVARS[k].cat === cat);
      if (!keys.length) continue;
      rows += '<tr class="cat-row"><td colspan="' + (2 + PRESETS.length) + '">' + esc(cat) + '</td></tr>';
      for (const key of keys) {
        const meta = CONVARS[key];
        const cells = PRESETS.map((p, i) => {
          const has = key in p.convars;
          const text = has ? valLabel(p.convars[key]) : '—';
          return '<td class="val-cell ' + valClass[i] + '">' + esc(text) + '</td>';
        }).join('');
        rows +=
          '<tr><td><div class="sname">' + esc(meta.label) + '</div>' +
          (meta.hint ? '<div class="shint">' + esc(meta.hint) + '</div>' : '') + '</td>' +
          '<td class="convar">' + esc(key) + '</td>' + cells + '</tr>';
      }
    }
    rows += '</tbody>';
    return '<table class="settings-table">' + rows + '</table>';
  }

  function renderRust(g) {
    // Base layout first; detection fills in asynchronously.
    $content.innerHTML =
      '<div class="view">' +
      '<div class="game-head">' +
        '<div class="gh-badge" style="background:' + esc(g.accent) + '">' + monogram(g.name) + '</div>' +
        '<div><h2>' + esc(g.name) + '</h2><div class="gg">' + esc(g.genre || '') + ' · fully supported</div></div>' +
      '</div>' +
      '<div id="rust-status"></div>' +
      '<div class="tools-row" id="rust-tools"></div>' +
      '<div class="section-title">' + svg('hex', 'hx') + ' Presets</div>' +
      '<div class="preset-grid">' + PRESETS.map(presetCard).join('') + '</div>' +
      '<div class="section-title">' + svg('sliders', 'hx') + ' Every setting, side by side</div>' +
      '<details class="collapsible"><summary>' + svg('chev', 'chev') +
        ' Full preset comparison (' + Object.keys(CONVARS).length + ' convars)</summary>' +
        '<div class="body">' + settingsTable() + '</div></details>' +
      '<div class="log" id="rust-log"></div>' +
      '</div>';

    // Wire preset Apply buttons.
    $content.querySelectorAll('[data-apply]').forEach((btn) =>
      btn.addEventListener('click', () => applyPreset(btn.dataset.apply, btn))
    );

    renderRustTools();
    refreshRustStatus();
  }

  function renderRustTools() {
    const tools = document.getElementById('rust-tools');
    if (!tools) return;
    const defs = [
      { id: 'locate', icon: 'folder', label: 'Locate Rust folder' },
      { id: 'opencfg', icon: 'folder', label: 'Open cfg folder' },
      { id: 'openbk', icon: 'folder', label: 'Open backups' },
      { id: 'restore', icon: 'restore', label: 'Restore latest backup' },
      { id: 'restoreorig', icon: 'restore', label: 'Restore original' },
    ];
    tools.innerHTML = defs
      .map((d) => '<button class="btn ghost sm" data-tool="' + d.id + '">' + svg(d.icon, 'li') + ' ' + d.label + '</button>')
      .join('');
    tools.querySelectorAll('[data-tool]').forEach((btn) =>
      btn.addEventListener('click', () => handleTool(btn.dataset.tool))
    );
  }

  async function refreshRustStatus() {
    const box = document.getElementById('rust-status');
    if (!box) return;

    if (!api) {
      setChip('warn', 'No bridge');
      box.innerHTML = notice('warn',
        'Running outside the desktop runtime — detection and config writing are disabled. Launch with <b>npm start</b>.');
      return;
    }

    box.innerHTML = '<div class="notice"><span class="ni skel" style="border-radius:99px"></span>' +
      '<div class="skel" style="height:13px;width:50%"></div></div>';

    let st;
    try { st = await api.rust.status(); }
    catch (e) { st = { detected: false, error: e.message }; }

    if (!st.detected) {
      setChip('warn', 'Rust not found');
      box.innerHTML = notice('warn',
        'Couldn’t auto-detect your Rust install. Click <b>Locate Rust folder</b> below and pick your ' +
        'Rust folder (or its <b>cfg</b> folder). We’ll remember it.');
      return;
    }

    // Detected — show path, and warn if the client is currently running.
    const path = st.clientCfgPath || st.cfgDir || '';
    let html = notice('ok', 'Rust detected. Presets write to <span class="path">' + esc(path) + '</span>' +
      (st.clientCfgExists ? '' : ' (a new client.cfg will be created on first apply).'));

    if (st.running) {
      setChip('warn', 'Rust running');
      html += notice('warn',
        '<b>Rust is currently running.</b> It rewrites client.cfg when it exits, which would undo changes. ' +
        'Close Rust before applying a preset.');
    } else {
      setChip('ok', 'Rust ready');
    }
    box.innerHTML = html;
  }

  function notice(kind, html) {
    const icon = kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'warn';
    return '<div class="notice ' + kind + '"><span class="ni">' + svg(icon) + '</span><div>' + html + '</div></div>';
  }

  // ----- tool actions -----
  async function handleTool(tool) {
    if (!api) return;
    const log = document.getElementById('rust-log');

    if (tool === 'locate') {
      const res = await api.rust.browse();
      if (res && res.canceled) return;
      if (res && res.detected) {
        logLine(log, true, 'Rust folder set: <span class="path">' + esc(res.cfgDir) + '</span>');
        refreshRustStatus();
      } else {
        logLine(log, false, 'That folder didn’t look like a Rust install' + (res && res.reason ? ' — ' + esc(res.reason) : '') + '.');
      }
      return;
    }
    if (tool === 'opencfg') {
      const r = await api.rust.openCfgFolder();
      if (!r.ok) logLine(log, false, 'Can’t open cfg folder — ' + esc(r.error || 'locate Rust first') + '.');
      return;
    }
    if (tool === 'openbk') {
      await api.rust.openBackupsFolder();
      return;
    }
    if (tool === 'restore' || tool === 'restoreorig') {
      const which = tool === 'restoreorig' ? 'original' : 'latest';
      const ok = window.confirm(
        which === 'original'
          ? 'Restore your ORIGINAL client.cfg (from before Settinger first touched it)? This overwrites the current file.'
          : 'Restore the most recent backup? This overwrites the current client.cfg.'
      );
      if (!ok) return;
      const r = await api.rust.restore(which);
      if (r.ok) logLine(log, true, 'Restored from <span class="path">' + esc(r.restoredFrom) + '</span>.');
      else logLine(log, false, 'Restore failed — ' + esc(r.error) + '.');
      return;
    }
  }

  // ----- apply a preset -----
  async function applyPreset(presetId, btn) {
    if (!api) return;
    const log = document.getElementById('rust-log');
    const preset = PRESETS.find((p) => p.id === presetId);
    const name = preset ? preset.name : presetId;

    // Re-check detection + running right before writing.
    let st;
    try { st = await api.rust.status(); } catch (_) { st = { detected: false }; }
    if (!st.detected) {
      logLine(log, false, 'Rust isn’t located yet — use <b>Locate Rust folder</b> first.');
      return;
    }
    if (st.running) {
      const proceed = window.confirm(
        'Rust appears to be running. It will overwrite client.cfg when it exits, undoing these changes.\n\n' +
        'Apply “' + name + '” anyway?'
      );
      if (!proceed) return;
    }

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
      const r = await api.rust.applyPreset(presetId);
      if (!r.ok) {
        logLine(log, false, 'Apply failed — ' + esc(r.error) + '.');
      } else {
        const parts = [];
        if (r.changedCount) parts.push(r.changedCount + ' changed');
        if (r.addedCount) parts.push(r.addedCount + ' added');
        if (r.unchangedCount) parts.push(r.unchangedCount + ' already set');
        const summary = parts.length ? ' (' + parts.join(', ') + ')' : '';
        logLine(log, true,
          'Applied <b>' + esc(r.presetName) + '</b>' + esc(summary) + ' → ' +
          '<span class="path">' + esc(r.clientCfgPath) + '</span>');
        if (r.backupPath) logLine(log, true, 'Backup saved: <span class="path">' + esc(r.backupPath) + '</span>');
        if (r.running) logLine(log, false, 'Heads up: Rust is running and may overwrite this on exit — restart Rust to load the new settings.');
      }
    } catch (err) {
      logLine(log, false, 'Apply failed — ' + esc(err.message) + '.');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function logLine(container, ok, html) {
    if (!container) return;
    const line = document.createElement('div');
    line.className = 'log-line ' + (ok ? 'ok' : 'err');
    line.innerHTML = '<span class="li ' + (ok ? 'ok' : 'err') + '">' + svg(ok ? 'check' : 'x') + '</span><span>' + html + '</span>';
    container.insertBefore(line, container.firstChild); // newest on top
  }

  // =========================================================================
  // Other games — honest "coming soon"
  // =========================================================================
  // Generic preset concepts shown (disabled) so the product vision is clear.
  const GENERIC = [
    { id: 'max_performance', name: 'Max Performance', tag: 'Every frame, no mercy', icon: 'zap',
      blurb: 'Strip the expensive eye-candy for the highest, steadiest frame rate.' },
    { id: 'max_quality', name: 'Max Quality', tag: 'Make it gorgeous', icon: 'gem',
      blurb: 'Push every visual dial up for the best-looking image on capable hardware.' },
    { id: 'pvp', name: 'PVP', tag: 'See first, shoot first', icon: 'crosshair',
      blurb: 'High frame rate with maximum clarity — no clutter to hide enemies.' },
  ];

  function renderOtherGame(g) {
    setChip('', 'Preview');
    const cards = GENERIC.map((p) =>
      '<div class="preset" style="--p-accent:' + esc(g.accent) + '">' +
      svg(p.icon, 'p-icon') +
      '<h3>' + esc(p.name) + '</h3>' +
      '<div class="p-tag">' + esc(p.tag) + '</div>' +
      '<div class="p-blurb">' + esc(p.blurb) + '</div>' +
      '<div class="p-actions"><button class="btn" disabled>Coming soon</button></div>' +
      '</div>'
    ).join('');

    $content.innerHTML =
      '<div class="view">' +
      '<div class="game-head">' +
        '<div class="gh-badge" style="background:' + esc(g.accent) + '">' + monogram(g.name) + '</div>' +
        '<div><h2>' + esc(g.name) + '</h2><div class="gg">' + esc(g.genre || '') + '</div></div>' +
      '</div>' +
      notice('info',
        'One-click auto-apply for <b>' + esc(g.name) + '</b> is on the roadmap. Today, Settinger writes ' +
        'settings directly for <b>Rust</b> — the presets below show the tuning philosophy we’ll bring to ' +
        'every title.') +
      '<div class="section-title">' + svg('hex', 'hx') + ' Preset philosophy</div>' +
      '<div class="preset-grid">' + cards + '</div>' +
      '</div>';
  }

  // =========================================================================
  // Init
  // =========================================================================
  $search.addEventListener('input', (e) => renderSidebar(e.target.value));
  $profileBtn.addEventListener('click', showProfile);

  renderSidebar('');
  showProfile(); // default landing view
})();
