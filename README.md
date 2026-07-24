# Settinger

**The go-to desktop app for gamers to dial in the best in-game settings for their rig.**

Settinger reads your PC's hardware, sizes up a performance "tier," and applies curated graphics presets — **Max Performance**, **Max Quality**, and **PVP** — straight to the game's config file. **Rust is fully wired today:** its presets write directly to `client.cfg`, with automatic backups and one-click restore. More titles are on the roadmap.

---

## Quick start

> Requires **Node.js 18+** installed.

```bash
npm install      # installs Electron + systeminformation
npm start        # launches the desktop app
```

The app opens on a (skippable) login screen — click **Skip for now** to go straight in during this dev phase.

Run the test suites any time with:

```bash
npm test
```

---

## What it does

### Profile — your rig at a glance
The **Profile** view probes your machine and lays out the specs that matter for gaming: CPU (cores / threads / clocks), GPU (model / VRAM), memory (size / type / speed), display (resolution / refresh), storage, OS and motherboard. From CPU threads, GPU VRAM and system RAM it derives a coarse **rig tier** (Entry → Mid → High → Elite) and suggests a starting Rust preset.

Hardware is read once per session and cached, so revisiting the page is instant.

### Rust — presets that actually change your settings
Pick a preset and hit **Apply preset**. Settinger:

1. **Locates** your Rust `cfg` folder (auto-detected via Steam, or set manually).
2. **Backs up** your current `client.cfg` (timestamped) — and keeps one pristine `ORIGINAL` copy the very first time it ever touches the file.
3. **Merges** the preset's values into `client.cfg` in place — only the preset's convars are changed; your comments, blank lines, ordering and any unrelated settings are preserved.
4. **Reports** exactly what changed (e.g. *"12 changed, 5 added, 3 already set"*) and where the backup landed.

A collapsible table shows **every convar across all three presets, side by side**, so you can see precisely what each one does before applying.

The three presets:

| Preset | Philosophy |
| --- | --- |
| **Max Performance** | Strips the expensive eye-candy for the highest, steadiest frame rate. Best for low-end rigs and big base fights. |
| **Max Quality** | Pushes every visual dial up for the best-looking Rust. For high-end GPUs and screenshots. |
| **PVP** | High frame rate **and** maximum clarity — low grass so players/loot can't hide, sane draw distance, sharpening on, motion blur and clutter off. |

---

## ⚠️ Important: close Rust before applying

Rust **rewrites `client.cfg` when it exits.** If Rust is running while you apply a preset, it will overwrite Settinger's changes on close.

Settinger detects when Rust is running and warns you. **Apply presets with Rust closed,** then launch the game to load the new settings.

---

## Restoring / undoing

Every apply makes a backup first. From the Rust view's tools row you can:

- **Restore latest backup** — roll back to the file as it was right before your last apply.
- **Restore original** — roll all the way back to the very first `client.cfg` Settinger saw.
- **Open backups** — open the backup folder in your file manager to grab a specific one.

Backups live in your per-user app-data directory under `backups/rust/`.

---

## How Rust detection works

Settinger looks for Rust (Steam app `252490`) by:

1. Finding your Steam install (common per-OS paths + the Windows registry).
2. Reading `libraryfolders.vdf` to discover **every** Steam library — games are often on a second drive.
3. Checking each library for Rust's game folder / app manifest.

If auto-detection misses (custom install, non-Steam copy), click **Locate Rust folder** and pick your Rust folder *or* its `cfg` folder. Settinger normalises it to the right place and remembers it.

---

## Privacy & security

- **All processing is local.** Specs and configs never leave your machine; there's no network/telemetry in the app.
- The UI runs **sandboxed** with `contextIsolation` on and `nodeIntegration` off. It can only talk to the privileged main process through a small, explicit bridge (`preload.js`) — no raw filesystem or Node access from the page.
- Settinger only ever modifies Rust's `client.cfg`, and always backs it up first.

---

## Project structure

```
settinger/
├─ package.json
├─ main.js                 # Electron main process — window + all privileged IPC (fs, hardware, process check)
├─ preload.js              # Secure bridge: the only API the UI can call
├─ assets/
│  └─ logo.svg             # Red hexagon "S" mark
├─ core/                   # Pure, testable logic (no Electron required)
│  ├─ specs.js             # Hardware probe + rig-tier derivation (systeminformation)
│  ├─ rust-locator.js      # Finds Rust's cfg folder across OSes / Steam libraries
│  ├─ rust-config.js       # Safe in-place client.cfg parse + merge
│  ├─ rust-presets.js      # Single source of truth: convar catalog + the 3 presets
│  ├─ test.js              # 20 unit tests for the config/preset logic
│  └─ test-renderer.js     # 39 headless UI tests (jsdom)
└─ renderer/               # The UI (sandboxed)
   ├─ login.html           # Skippable login
   ├─ app.html             # App shell
   ├─ app.js               # All view logic
   ├─ styles.css           # Dark hardware-console design system
   └─ games-data.js        # Game catalog for the sidebar
```

---

## Roadmap

- One-click auto-apply for more titles (the sidebar already lists them; only Rust writes today).
- Real authentication + cloud-synced preset profiles.
- Per-convar custom tuning on top of the presets.

---

## Notes on the presets

The Rust convars, their legal ranges and the preset values are taken from Rust's documented client convars and corroborated against current optimisation guides. They're sensible, research-backed starting points — feel free to tweak from the comparison table. "Best" is always partly personal, so treat the presets as strong defaults, not gospel.

Built with Electron. Rust is a trademark of Facepunch Studios; Settinger is an unofficial companion tool and ships no game assets.
