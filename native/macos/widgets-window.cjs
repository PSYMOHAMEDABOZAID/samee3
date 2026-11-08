// SAMEE3 desktop mini-widget for Electron (macOS/Windows).
// This is a floating app window, NOT an OS WidgetKit / Windows Widgets Board provider.
'use strict'
const { BrowserWindow, shell } = require('electron')
const SITE = 'https://samee3.vercel.app'
let window = null
function trusted(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.origin === SITE && !u.username && !u.password
  } catch { return false }
}
function showWidgetWindow() {
  if (window && !window.isDestroyed()) {
    if (window.isVisible()) window.hide()
    else { window.show(); window.focus() }
    return
  }
  window = new BrowserWindow({
    width: 390, height: 610, minWidth: 310, minHeight: 400, title: 'ويدجت مصحف سميع',
    alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#f7f6f0',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  })
  window.webContents.setWindowOpenHandler(({url}) => {
    if (trusted(url)) void window?.webContents.loadURL(url)
    else if (/^https:\/\//.test(url)) void shell.openExternal(url).catch(() => {})
    return {action: 'deny'}
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!trusted(url)) {
      event.preventDefault()
      if (/^https:\/\//.test(url)) void shell.openExternal(url).catch(() => {})
    }
  })
  window.on('closed', () => { window = null })
  window.loadURL(SITE + '/widgets').catch(() => {})
}
function closeWidgetWindow() { if (window && !window.isDestroyed()) window.close() }
module.exports = { showWidgetWindow, closeWidgetWindow, trusted }
