'use strict';

/**
 * preload.js
 * Bridges the sandboxed renderer to the privileged main process. The renderer
 * gets exactly this API surface and nothing else — no fs, no require, no ipc.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settinger', {
  // System specs
  getSpecs: () => ipcRenderer.invoke('specs:get'),

  // Rust install + config
  rust: {
    status: () => ipcRenderer.invoke('rust:status'),
    browse: () => ipcRenderer.invoke('rust:browse'),
    clearPath: () => ipcRenderer.invoke('rust:clearPath'),
    readConfig: () => ipcRenderer.invoke('rust:readConfig'),
    applyPreset: (presetId) => ipcRenderer.invoke('rust:applyPreset', presetId),
    restore: (which) => ipcRenderer.invoke('rust:restore', which),
    openCfgFolder: () => ipcRenderer.invoke('rust:openCfgFolder'),
    openBackupsFolder: () => ipcRenderer.invoke('rust:openBackupsFolder'),
  },
});
