# Best Rust Settings — NVIDIA Users (GTX / RTX)

> Researched July 2026 from current guides + Facepunch changelogs. Rust's
> options menu was rebuilt in the Aug 2025 "Harder Core" update and the game
> moved to Unity 6 in June 2026 — guides older than that are partly stale.
> Goal: maximum FPS **and** competitive clarity. "Quality" alternates in
> (parentheses) where they differ.

## 1. Screen

| Setting | Best value | Why |
|---|---|---|
| Display Mode | **Exclusive Fullscreen** | Lowest input lag |
| Resolution | Monitor native (PvP habit: 1440×1080 stretched) | Stretched is preference, not FPS |
| V-Sync | **Off** | Latency; use G-Sync instead |
| FPS Limit | Cap you can hold; with G-Sync ~3 below refresh | Stable frametimes beat peaks |
| Limit FPS in menus | On | Saves power/heat |

## 2. Graphics tab

| Setting | Best value | Notes |
|---|---|---|
| Graphics Quality (master) | **2** (0–1 potato rigs; 5–6 quality) | Single biggest FPS lever |
| Render Scale | **1.0 — never lower** | Blur kills clarity; use DLSS instead |
| NVIDIA DLSS (RTX) | **Off at 1080p; Quality at 1440p/4K** | Rust is CPU-bound at 1080p — DLSS shines only when GPU-bound. DLAA if you have GPU headroom |
| NVIDIA Reflex (GTX 900+) | **On + Boost** | Big latency cut; detection bug fixed June 2026 |
| Draw / World Distance | **1500–2000** (2500 quality) | Never below ~1500 — you must render distant players |
| Shadow Quality | **0** (1 if you want enemy shadows) | Up to ~15–25 FPS |
| Shadow Distance | **100–200** | |
| Shadow Cascades | **No Cascades** | Up to ~18 FPS |
| Max Shadow Lights | **0** | Not worth the cost |
| Water Quality | **0** (1–2 quality) | Water + reflections can cost ~27 FPS |
| Water Reflections | **0** | No competitive value |
| World Reflections | **Off** | |
| Shader Level | **300** (200–400; 600 quality) | Below ~200 distant terrain goes flat |
| Anisotropic Filtering | **2×** older GPUs, 8–16× fine on modern | Near-free on RTX cards |
| Parallax Mapping | **0** | Heavy for what it adds |
| Texture Quality | **Full if ≥6 GB VRAM**, else Half | VRAM-dependent, small FPS impact |
| Object / Mesh Quality | **100–150** (200 quality) | Big CPU lever |
| Tree Quality | **100–200 — do NOT floor it** | Too low = unreadable billboard trees |
| Max Tree Meshes | **50–100** | Keeps treeline sightlines clear |
| Terrain Quality | **0–50** (100 quality) | |
| Grass Quality | **0** (50–100 quality) | FPS + spot players/loot in grass |
| Grass Shadows | **Off** | |
| Grass Displacement | **On** | Deliberate exception: shows movement trails + flattened grass where loot fell |
| Decor Quality | **0** (100 quality) | Less clutter = easier spotting |
| Particle Quality | **0–25** (60–100 quality) | |
| Particle Raycast Budget | **Minimum** | Stops fires/explosions tanking FPS |
| Soft Particles | Off (On is cheap if you dislike halo artifacts) | |
| Pixel Light Count | **Minimum** | |
| Max Gibs | **0** | The most unanimous competitive setting — raid FPS + debris blocks sightlines |
| Accurate Terrain Billboards | On | |

## 3. Image Effects tab

| Setting | Best value | Notes |
|---|---|---|
| Anti-Aliasing | **SMAA** at 1080p; **DLAA** (RTX, added Feb 2025) if GPU headroom | TAA blur was reduced Feb 2025 but SMAA stays sharpest in motion |
| Depth of Field | **Off** | |
| Motion Blur | **Off** | |
| Ambient Occlusion | **Off** (~5–6% FPS) | |
| High Quality Bloom | **Off** | |
| Lens Dirt | **Off** | |
| Sun Shafts | **Off** | Sun glare hides enemies |
| Sharpen | **On** | Nearly free clarity |
| Vignetting | **Off** | |
| Contact Shadows | **Off** | High cost |

## 4. Experimental tab

| Setting | Best value | Notes |
|---|---|---|
| Occlusion Culling | **On** | ~10% in settlements; Off only if camera turns hitch |
| GC Buffer | **Max the slider** (~4096 with 32 GB RAM, ~1800 with 16 GB) | Fewer garbage-collection freezes |
| Volumetric Clouds | **Off** | Added Aug 2025; destroys FPS |
| Shadow caching mode | Try **On** | New July 2026; test per system |

"Optimized Loading" and "Shadow Mask" were **removed** from the menu (Aug 2025 / July 2026) — ignore guides that still mention them.

## 5. Gameplay / misc

FOV **90** · Hit Cross **On** · Hurt Flash **Off/Low** · Show Blood **On** ·
Compass **On** · Music volume **0** (hear footsteps) ·
Mouse polling rate **≤1000 Hz** (official Facepunch advice after Unity 6 if you see frame drops).

## 6. NVIDIA Control Panel / NVIDIA App (RustClient.exe profile)

| Setting | Value |
|---|---|
| Power management mode | **Prefer maximum performance** |
| Low Latency Mode | **Off** — in-game Reflex replaces it (one guide says Ultra; Off + Reflex is technically correct) |
| Vertical Sync | **Off** |
| Texture filtering — Quality | **High performance** |
| Threaded optimization | **Auto** |
| Shader cache size | **10 GB** |
| Max frame rate | Optional cap (see G-Sync) |
| **G-Sync users** | G-Sync On + in-game Reflex On+Boost + V-Sync Off + cap ~3 FPS below refresh |
| NVIDIA App | DLSS Override → **Latest (Preset K / DLSS 4 transformer)** if using DLSS; **disable the overlay** |

## 7. Launch options (Steam → Rust → Properties)

Recommended: `-window-mode exclusive -nolog -high -effects.maxgibs 0 -gc.buffer 2048`

- ✅ Valid: `-window-mode exclusive`, `-nolog`, `-gc.buffer 2048/4096`, any `+convar value`
- 🟡 Small/disputed: `-high` (helps only with background load), `-maxMem=<your RAM in MB>` (harmless, debated)
- ❌ Myths — skip: `-malloc=system`, `-cpuCount=X`, `-exThreads=X`, `-USEALLAVAILABLECORES`, `-winxp`
- ⚠ `-force-d3d11-no-singlethreaded`: reported crashes/artifacts **specifically on NVIDIA** — avoid

## 8. Bonus console convars (F1)

`gc.buffer 4096` · `bind p gc.collect` (flush memory between fights) ·
`pool.clear_memory` on long sessions · `graphics.vm_fov_scale false` (smaller viewmodel) ·
`hitnotify.notification_level 2` (server-authoritative hitmarkers) ·
`client.clampscreenshake true` · `physics.steps 60` (movement feel) ·
`graphics.branding 0` · `perf 1` (FPS overlay for your own A/B tests).

## 9. System-level (all vendors)

Ultimate Performance power plan · XMP/EXPO on (Rust loves RAM speed) ·
Hardware-Accelerated GPU Scheduling on · Windows Game Mode on ·
Memory Integrity / VBS off (+5–15%) · overlays off · 16–32 GB RAM · NVMe/SSD.
