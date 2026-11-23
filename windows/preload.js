// Webアプリに「Windowsアプリから開いているよ」と教える小さな橋
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fvDesktop', {
  platform: 'windows',
  googleLogin: () => ipcRenderer.invoke('fv:google-login'),
  setBackground: on => ipcRenderer.send('fv:set-bg', !!on),
  focus: () => ipcRenderer.send('fv:focus'),
});
