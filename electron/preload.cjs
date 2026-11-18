const { contextBridge, ipcRenderer } = require('electron')

const desktopApi = {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // Secure Storage (Electron safeStorage API)
  isSecureStorageAvailable: () => ipcRenderer.invoke('secure-storage-is-available'),
  getSecureCredential: (key) => ipcRenderer.invoke('secure-storage-get', key),
  setSecureCredential: (key, val) => ipcRenderer.invoke('secure-storage-set', key, val),
  deleteSecureCredential: (key) => ipcRenderer.invoke('secure-storage-delete', key),
  // Dynamic Theme Icon Switching
  setThemeIcon: (theme) => ipcRenderer.send('theme-icon-change', theme),
}

// Expose modern evaDesktop and legacy nexusDesktop for backwards compatibility
contextBridge.exposeInMainWorld('evaDesktop', desktopApi)
contextBridge.exposeInMainWorld('nexusDesktop', desktopApi)
