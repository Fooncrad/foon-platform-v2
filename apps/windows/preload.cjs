'use strict';
const {contextBridge, ipcRenderer} = require('electron');
// Only the bundled setup page receives the narrow configuration capability.
if (location.protocol === 'file:' && location.pathname.endsWith('/setup.html')) {
  contextBridge.exposeInMainWorld('foonSetup', {save: input => ipcRenderer.invoke('foon:configure', input), enroll:cloudUrl=>ipcRenderer.invoke('foon:enroll',cloudUrl), current:()=>ipcRenderer.invoke('foon:enrollment-status')});
}
