'use strict';

/**
 * core/specs.js
 * ---------------------------------------------------------------------------
 * Gathers the hardware specs that matter to a gamer and shapes them into a
 * clean object for the UI. Each section is independently guarded so a failure
 * reading (say) the motherboard never takes down the whole profile.
 *
 * Also derives a rough "rig tier" (Entry / Mid / High / Elite) from CPU
 * threads, GPU VRAM and system RAM — used to suggest a starting preset.
 * ---------------------------------------------------------------------------
 */

const si = require('systeminformation');

function bytesToGB(bytes) {
  if (!bytes || bytes <= 0) return null;
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

async function safe(promise, fallback) {
  try {
    return await promise;
  } catch (_) {
    return fallback;
  }
}

/**
 * Derive a coarse performance tier and a one-line rationale.
 */
function deriveTier({ threads, vram, ramGB }) {
  let score = 0;
  if (threads) score += Math.min(threads, 32) * 1.2;        // up to ~38
  if (vram) score += Math.min(vram, 24) * 2.0;              // up to 48
  if (ramGB) score += Math.min(ramGB, 64) * 0.5;           // up to 32

  let tier = 'Entry';
  if (score >= 95) tier = 'Elite';
  else if (score >= 70) tier = 'High';
  else if (score >= 45) tier = 'Mid';

  const suggested = {
    Entry: 'max_performance',
    Mid: 'pvp',
    High: 'pvp',
    Elite: 'max_quality',
  }[tier];

  return { tier, score: Math.round(score), suggested };
}

/**
 * @returns {Promise<object>} structured spec sheet
 */
async function getSpecs() {
  const [cpu, graphics, mem, memLayout, osInfo, system, baseboard, disks, gfxDisplays] = await Promise.all([
    safe(si.cpu(), {}),
    safe(si.graphics(), { controllers: [], displays: [] }),
    safe(si.mem(), {}),
    safe(si.memLayout(), []),
    safe(si.osInfo(), {}),
    safe(si.system(), {}),
    safe(si.baseboard(), {}),
    safe(si.diskLayout(), []),
    safe(si.graphics(), { displays: [] }),
  ]);

  // ---- CPU ----
  const cpuOut = {
    brand: [cpu.manufacturer, cpu.brand].filter(Boolean).join(' ').trim() || 'Unknown CPU',
    cores: cpu.physicalCores || cpu.cores || null,
    threads: cpu.cores || null,
    speed: cpu.speed ? `${round1(cpu.speed)} GHz` : null,
    speedMax: cpu.speedMax ? `${round1(cpu.speedMax)} GHz` : null,
  };

  // ---- GPU(s) ----
  const controllers = (graphics.controllers || []).filter((c) => c && (c.model || c.vendor));
  const gpus = controllers.map((c) => ({
    model: c.model || `${c.vendor || ''} GPU`.trim(),
    vendor: c.vendor || null,
    vramGB: c.vram ? round1(c.vram / 1024) : null, // si reports vram in MB
  }));
  const primaryVram = gpus.reduce((max, g) => (g.vramGB && g.vramGB > max ? g.vramGB : max), 0) || null;

  // ---- RAM ----
  const ramGB = bytesToGB(mem.total);
  const sticks = (memLayout || []).filter((m) => m && m.size);
  const ramType = sticks.find((m) => m.type)?.type || null;
  const ramSpeed = sticks.find((m) => m.clockSpeed)?.clockSpeed || null;
  const ramOut = {
    totalGB: ramGB,
    type: ramType,
    speed: ramSpeed ? `${ramSpeed} MHz` : null,
    sticks: sticks.length || null,
  };

  // ---- OS ----
  const osOut = {
    name: [osInfo.distro, osInfo.release].filter(Boolean).join(' ').trim() || osInfo.platform || 'Unknown OS',
    arch: osInfo.arch || null,
    build: osInfo.build || null,
  };

  // ---- Motherboard ----
  const mbOut = {
    name: [baseboard.manufacturer, baseboard.model].filter(Boolean).join(' ').trim()
      || [system.manufacturer, system.model].filter(Boolean).join(' ').trim()
      || 'Unknown',
  };

  // ---- Storage ----
  const storage = (disks || [])
    .filter((d) => d && d.size)
    .map((d) => ({
      name: d.name || d.device || 'Disk',
      type: d.type || (d.interfaceType === 'NVMe' ? 'NVMe' : null),
      sizeGB: bytesToGB(d.size),
      interface: d.interfaceType || null,
    }));

  // ---- Displays ----
  const displays = (gfxDisplays.displays || [])
    .filter((d) => d && (d.currentResX || d.resolutionX))
    .map((d) => ({
      resolution: `${d.currentResX || d.resolutionX}\u00d7${d.currentResY || d.resolutionY}`,
      refresh: d.currentRefreshRate ? `${d.currentRefreshRate} Hz` : null,
      main: !!d.main,
    }));

  const tier = deriveTier({ threads: cpuOut.threads, vram: primaryVram, ramGB });

  return {
    generatedAt: new Date().toISOString(),
    tier,
    cpu: cpuOut,
    gpus,
    ram: ramOut,
    os: osOut,
    motherboard: mbOut,
    storage,
    displays,
  };
}

module.exports = { getSpecs, deriveTier };
