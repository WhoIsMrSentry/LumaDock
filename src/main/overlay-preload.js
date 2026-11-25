'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumadockOverlay', {
  onSnipInit: cb => ipcRenderer.on('snip:init', (_e, data) => cb(data)),
  snipComplete: payload => ipcRenderer.invoke('snip:complete', payload),
  snipCancel: () => ipcRenderer.invoke('snip:cancel'),
  onPinInit: cb => ipcRenderer.on('pin:init', (_e, data) => cb(data)),
  pinAction: payload => ipcRenderer.invoke('pin:action', payload),
  onEyedropperInit: cb => ipcRenderer.on('eyedropper:init', (_e, data) => cb(data)),
  eyedropperComplete: payload => ipcRenderer.invoke('eyedropper:complete', payload),
  eyedropperCancel: () => ipcRenderer.invoke('eyedropper:cancel'),
  rulerCopy: text => ipcRenderer.invoke('eyedropper:ruler-copy', { text })
});
