const { contextBridge, ipcRenderer } = require('electron')
if (process.isMainFrame && location.protocol === 'samee3:' && location.host === 'app') {
  contextBridge.exposeInMainWorld('Samee3Windows', {
    request: (action, payload) => ipcRenderer.invoke('samee3:local', { action, payload }),
    onState(callback) { const listener = (_event, state) => callback(state); ipcRenderer.on('samee3:state', listener); return () => ipcRenderer.removeListener('samee3:state', listener) },
    onAudio(callback) { const listener = (_event, state) => callback(state); ipcRenderer.on('samee3:audio', listener); return () => ipcRenderer.removeListener('samee3:audio', listener) },
  })
}
if (process.isMainFrame && location.origin === 'https://samee3.vercel.app') {
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor) return
    try { const u = new URL(anchor.href); if (u.origin === location.origin && u.pathname === '/notifications') { event.preventDefault(); event.stopImmediatePropagation(); ipcRenderer.send('samee3:reminders') } } catch {}
  }, true)
}
