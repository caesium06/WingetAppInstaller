const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize:    () => ipcRenderer.invoke('window:minimize'),
  maximize:    () => ipcRenderer.invoke('window:maximize'),
  close:       () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Winget queries
  search:     (query)         => ipcRenderer.invoke('winget:search', query),
  list:       ()              => ipcRenderer.invoke('winget:list'),
  featured:   ()              => ipcRenderer.invoke('winget:featured'),
  versions:   (id)            => ipcRenderer.invoke('winget:versions', id),
  upgradable: ()              => ipcRenderer.invoke('winget:upgradable'),

  // Winget actions (streaming)
  install:    (id, version)   => ipcRenderer.invoke('winget:install', id, version),
  uninstall:  (id)            => ipcRenderer.invoke('winget:uninstall', id),
  upgrade:    (id)            => ipcRenderer.invoke('winget:upgrade', id),

  // Streaming events — install
  onProgress:          (cb) => ipcRenderer.on('install:progress',   (_e, d) => cb(d)),
  onDone:              (cb) => ipcRenderer.on('install:done',        (_e, d) => cb(d)),
  // Streaming events — uninstall
  onUninstallProgress: (cb) => ipcRenderer.on('uninstall:progress', (_e, d) => cb(d)),
  onUninstallDone:     (cb) => ipcRenderer.on('uninstall:done',     (_e, d) => cb(d)),
  // Streaming events — upgrade
  onUpgradeProgress:   (cb) => ipcRenderer.on('upgrade:progress',   (_e, d) => cb(d)),
  onUpgradeDone:       (cb) => ipcRenderer.on('upgrade:done',       (_e, d) => cb(d)),
});
