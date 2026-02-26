const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getStreamUrl: (url) => ipcRenderer.invoke('get-stream-url', url),
    searchYoutube: (query) => ipcRenderer.invoke('search-youtube', query),
    getUrlInfo: (url) => ipcRenderer.invoke('get-url-info', url),
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    minimizeApp: () => ipcRenderer.send('minimize-app'),
    closeApp: () => ipcRenderer.send('close-app'),
});
