const { app, BrowserWindow, WebContentsView, Menu, ipcMain, protocol, net, session, shell, dialog, clipboard, Notification, powerMonitor, nativeImage, Tray } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const C = require('./core.cjs')
const { showWidgetWindow, closeWidgetWindow } = require('./widgets-window.cjs')
const P = require('./platform.cjs')
const catalog = require('./data/adhan-catalog.json')
const hadiths = require('./data/reminders.json').hadiths
const voices = catalog.voices.map(v => v.id)
const ROOT = __dirname
const PRELOAD = path.join(ROOT, 'preload.cjs')
const LOCAL = C.LOCAL + '/ui/'
const TOP = 78
app.setName('مصحف سميع')
app.setPath('userData', path.join(app.getPath('appData'), 'Samee3-Windows'))
if (process.platform === 'win32') app.setAppUserModelId(P.APP_ID)
protocol.registerSchemesAsPrivileged([{ scheme: 'samee3', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }])
let win, view, tray, player, playerReady, audioGeneration = 0, store = {}, settings = { ...C.DEFAULTS }, quitting = false, nextTimes = {}, calendarError = '', audioPlaying = false, lastTick = Date.now(), calendarLoading = false, calendarTask = null
let status = { route: '/', title: 'مصحف سميع', busy: true, offline: false, message: '', canBack: false, canForward: false }
const notifications = new Set()
const localPreferences = { preload: PRELOAD, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
function storePath() { return path.join(app.getPath('userData'), 'preferences.json') }
function persist() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  const target = storePath(), temporary = target + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(store), { mode: 0o600 }); fs.renameSync(temporary, target)
}
function readStore() {
  try { store = JSON.parse(fs.readFileSync(storePath(), 'utf8')); settings = C.settings(store.settings || {}, voices) }
  catch { store = {}; settings = { ...C.DEFAULTS } }
  if (!store.delivered || typeof store.delivered !== 'object') store.delivered = {}
}
function effectiveSettings() { return settings.systemTimezone ? { ...settings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : settings }
function savedCalendar() { return store.calendarIdentity === C.calendarIdentity(settings) && Array.isArray(store.calendar) ? store.calendar : [] }
function reschedule() {
  nextTimes = {}
  for (const key of C.KEYS) { const at = C.next(effectiveSettings(), key, Date.now(), savedCalendar()); if (Number.isFinite(at) && at > 0) nextTimes[key] = at }
  sendState()
}
function localState() {
  return { ...status, version: app.getVersion(), platform: process.platform, settings: effectiveSettings(), next: nextTimes,
    calendarUntil: savedCalendar().at(-1)?.date || '', calendarError, calendarLoading, audioPlaying,
    notificationSupported: Notification.isSupported(), notificationError: store.notificationError || '' }
}
function sendState() {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('samee3:state', localState())
  if (view && !view.webContents.isDestroyed() && C.localURL(view.webContents.getURL())) view.webContents.send('samee3:state', localState())
}
function show() { if (win && !win.isDestroyed()) { win.show(); win.focus() } }
function sizeView() { if (win && view) { const [width, height] = win.getContentSize(); view.setBounds({ x: 0, y: TOP, width, height: Math.max(1, height - TOP) }) } }
function routeURL(route) {
  if (route === 'reader') return LOCAL + 'reader.html'
  if (route === 'settings') return LOCAL + 'settings.html'
  if (typeof route === 'string' && /^hadith:bukhari-[0-9]+$/.test(route) && hadiths.some(h => 'hadith:' + h.id === route)) return LOCAL + 'hadith.html?id=' + route.slice(7)
  if (typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') && route.length < 2048) { const u = new URL(route, C.SITE); if (C.websiteURL(u.href)) return u.href }
  throw new Error('المسار غير متاح.')
}
async function navigate(route) {
  if (route === '/notifications') route = 'settings'
  const url = routeURL(route)
  status.message = ''; status.route = route; sendState()
  try { await view.webContents.loadURL(url) }
  catch (error) { if (error.code !== 'ERR_ABORTED' && error.errno !== -3 && C.websiteURL(url)) await offline('تعذر الاتصال بالموقع. المصحف المحفوظ متاح، ويمكنك إعادة فتح الرئيسية عند عودة الإنترنت.') }
}
async function offline(message) {
  status.message = message; status.route = 'reader'; status.offline = true
  await view.webContents.loadURL(LOCAL + 'reader.html').catch(() => {})
  sendState()
}
function safeExternal(url) { if (C.externalURL(url)) void shell.openExternal(url).catch(() => {}) }
function installNavigation(contents) {
  contents.on('will-navigate', (event, url) => {
    if (C.websiteURL(url) && new URL(url).pathname === '/notifications') { event.preventDefault(); void navigate('settings'); return }
    if (!C.websiteURL(url) && !C.localURL(url)) { event.preventDefault(); safeExternal(url) }
  })
  contents.on('will-redirect', (event, url) => { if (!C.websiteURL(url) && !C.localURL(url)) { event.preventDefault(); safeExternal(url) } })
  const authURL = raw => { try { const u = new URL(raw); return u.protocol === 'https:' && (u.hostname === 'accounts.google.com' || (u.hostname.endsWith('.firebaseapp.com') && u.pathname.startsWith('/__/auth/'))) } catch { return false } }
  contents.setWindowOpenHandler(({ url }) => {
    if (authURL(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 540, height: 760, parent: win, autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } }
    if (C.websiteURL(url)) { void contents.loadURL(url); return { action: 'deny' } }
    safeExternal(url); return { action: 'deny' }
  })
  contents.on('did-create-window', child => {
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    for (const name of ['will-navigate', 'will-redirect']) child.webContents.on(name, (event, url) => { if (!authURL(url) && !C.websiteURL(url)) { event.preventDefault(); safeExternal(url) } })
  })
  contents.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame && C.websiteURL(url) && new URL(url).pathname === '/notifications') void navigate('settings'); updateNavigation() })
  contents.on('did-navigate', updateNavigation)
  contents.on('did-start-loading', () => { status.busy = true; sendState() })
  contents.on('did-stop-loading', () => { status.busy = false; updateNavigation() })
  contents.on('page-title-updated', (_event, title) => { status.title = String(title).slice(0, 180); sendState() })
  contents.on('render-process-gone', () => void offline('توقف عرض الصفحة. يمكنك متابعة المصحف المحفوظ أو إعادة تحميل الرئيسية.'))
  contents.on('unresponsive', () => { status.message = 'الصفحة تستغرق وقتًا أطول. يمكنك إعادة تحميلها من الشريط.'; sendState() })
}
function updateNavigation() {
  if (!view || view.webContents.isDestroyed()) return
  const contents = view.webContents, url = contents.getURL()
  status.offline = C.localURL(url)
  status.canBack = contents.navigationHistory.canGoBack(); status.canForward = contents.navigationHistory.canGoForward()
  if (C.websiteURL(url)) status.route = new URL(url).pathname
  sendState()
}
async function configureSession() {
  const ses = session.defaultSession
  ses.protocol.handle('samee3', request => {
    const file = C.resource(request.url, ROOT)
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  const approvals = new Set()
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin) => Boolean(contents && C.websiteURL(contents.getURL()) && requestingOrigin === C.SITE && approvals.has(permission)))
  ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (!C.websiteURL(contents.getURL()) || details.isMainFrame === false || !['geolocation', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)) return callback(false)
    if (permission === 'fullscreen' || permission === 'clipboard-sanitized-write') return callback(true)
    if (approvals.has(permission)) return callback(true)
    const name = { geolocation: 'الموقع لتحديد مواقيت الصلاة والقبلة', media: 'الكاميرا أو الميكروفون', 'clipboard-read': 'قراءة الحافظة' }[permission]
    const result = await dialog.showMessageBox(win, { type: 'question', title: 'إذن داخل مصحف سميع', message: 'هل تسمح باستخدام ' + name + '؟', buttons: ['سماح', 'إلغاء'], defaultId: 1, cancelId: 1 })
    if (result.response === 0) approvals.add(permission)
    callback(result.response === 0)
  })
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'حفظ الملف من مصحف سميع', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) })
    item.on('updated', () => win?.setProgressBar(item.getTotalBytes() > 0 ? item.getReceivedBytes() / item.getTotalBytes() : 2))
    item.once('done', (_e, state) => { win?.setProgressBar(-1); status.message = state === 'completed' ? 'اكتمل حفظ الملف.' : state === 'cancelled' ? 'أُلغي التنزيل.' : 'لم يكتمل تنزيل الملف.'; sendState() })
  })
}
async function playVoice(id, volume = settings.volume) {
  if (!voices.includes(id)) throw new Error('هذا الصوت غير موجود.')
  if (!Number.isFinite(volume) || volume < 1 || volume > 100) throw new Error('مستوى الصوت غير صحيح.')
  const generation = ++audioGeneration
  if (!player || player.isDestroyed()) {
    player = new BrowserWindow({ show: false, width: 400, height: 240, webPreferences: { ...localPreferences, backgroundThrottling: false } })
    player.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    player.webContents.on('will-navigate', event => event.preventDefault())
    playerReady = player.loadURL(LOCAL + 'player.html')
  }
  await playerReady
  if (generation !== audioGeneration) return
  if (view && !view.webContents.isDestroyed()) void view.webContents.executeJavaScript("document.querySelectorAll('audio,video').forEach(media => { if (!media.muted) media.pause() })").catch(() => {})
  player.webContents.send('samee3:audio', { id, generation, volume: volume / 100 })
  audioPlaying = true; sendState()
}
function stopAudio() { audioGeneration++; if (player && !player.isDestroyed()) player.webContents.send('samee3:audio', { stop: true, generation: audioGeneration }); audioPlaying = false; sendState() }
function deliver(key, test = false) {
  if (!Notification.isSupported()) throw new Error('إشعارات النظام غير متاحة. راجع إعدادات الإشعارات في Windows.')
  const item = C.notification(key, settings, hadiths, store.hadithIndex || 0)
  if (!item) return
  const full = !test && C.PRAYERS.includes(key) && settings.fullAdhan
  const n = new Notification({ title: (test ? 'اختبار — ' : '') + item.title, body: item.body, silent: full, icon: path.join(ROOT, 'ui/logo.png') })
  notifications.add(n)
  n.on('click', () => { show(); void navigate(item.route) })
  n.on('close', () => notifications.delete(n))
  n.on('failed', (_event, error) => { store.notificationError = 'تعذر إظهار الإشعار: ' + String(error || '').slice(0, 200) + ' — راجع السماح لسميع من إعدادات إشعارات Windows.'; persist(); sendState(); notifications.delete(n) })
  n.show()
  if (!test && key === 'hadith') { store.hadithIndex = ((store.hadithIndex || 0) + 1) % hadiths.length; persist() }
  if (full) void playVoice(key === 'Fajr' ? settings.fajrVoice : settings.adhanVoice).catch(() => { status.message = 'تعذر تشغيل الأذان؛ الإشعار ما زال متاحًا.'; sendState() })
}
function tick() {
  const now = Date.now()
  if (now < lastTick) { lastTick = now; reschedule(); return }
  lastTick = now
  for (const [key, at] of Object.entries(nextTimes)) if (now >= at) {
    if (C.enabled(settings, key) && store.delivered[key] !== at && now - at < (C.PRAYERS.includes(key) ? 5 : 30) * 60000) {
      store.delivered[key] = at; persist()
      try { deliver(key) } catch (error) { store.notificationError = error.message; persist() }
    }
    const upcoming = C.next(effectiveSettings(), key, now, savedCalendar()); if (Number.isFinite(upcoming) && upcoming > now) nextTimes[key] = upcoming; else delete nextTimes[key]
    sendState()
  }
}
async function refreshCalendar(force = false) {
  if (calendarTask) return calendarTask
  if (!settings.prayer) return
  if (!force && store.calendarIdentity === C.calendarIdentity(settings) && Date.now() - (store.calendarFetchedAt || 0) < 12 * 3600000) return
  const captured = { ...settings }, identity = C.calendarIdentity(captured)
  calendarLoading = true; calendarError = ''; sendState()
  calendarTask = (async () => {
    try {
      const c = C.clock(Date.now(), captured.timezone), days = []
      for (let i = 0; i < 3; i++) {
        const month = new Date(Date.UTC(Number(c.year), Number(c.month) - 1 + i, 1))
        const u = new URL(`https://api.aladhan.com/v1/calendarByCity/${month.getUTCFullYear()}/${month.getUTCMonth() + 1}`)
        for (const [key, value] of Object.entries({ city: captured.city, country: captured.country, method: captured.method, school: captured.school, iso8601: true })) u.searchParams.set(key, String(value))
        const response = await net.fetch(u.href, { signal: AbortSignal.timeout(25000), redirect: 'error' })
        if (!response.ok) throw new Error('تعذر الاتصال بخدمة المواقيت.')
        days.push(...C.parseCalendar(await response.json()))
      }
      if (settings.prayer && C.calendarIdentity(settings) === identity) {
        store.calendar = days; store.calendarIdentity = identity; store.calendarFetchedAt = Date.now(); persist(); reschedule()
      }
    } catch (error) { calendarError = 'لم يتجدد جدول الصلاة: ' + error.message + (savedCalendar().length ? ' يُستخدم الجدول المحفوظ.' : ' راجع المدينة والدولة والاتصال.'); sendState() }
    finally { calendarLoading = false; calendarTask = null; sendState(); if (settings.prayer && C.calendarIdentity(settings) !== identity) setTimeout(() => void refreshCalendar(), 0) }
  })()
  return calendarTask
}
function ensureLocal(event, allowed) {
  if (event.senderFrame !== event.sender.mainFrame || !C.localURL(event.senderFrame.url) || !allowed.includes(new URL(event.senderFrame.url).pathname)) throw new Error('الطلب غير مسموح.')
}
ipcMain.handle('samee3:local', async (event, data) => {
  ensureLocal(event, ['/ui/shell.html', '/ui/settings.html', '/ui/reader.html', '/ui/hadith.html', '/ui/player.html'])
  if (!data || typeof data.action !== 'string') throw new Error('طلب غير صحيح.')
  const { action, payload } = data, page = new URL(event.senderFrame.url).pathname
  if (action === 'status') return localState()
  if (action === 'navigate' && page !== '/ui/player.html') { show(); await navigate(payload); return localState() }
  if (action === 'copy' && typeof payload === 'string' && payload.length <= 12000 && page !== '/ui/player.html') { clipboard.writeText(payload); return true }
  if (page === '/ui/shell.html') {
    if (action === 'back' && view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
    else if (action === 'forward' && view.webContents.navigationHistory.canGoForward()) view.webContents.navigationHistory.goForward()
    else if (action === 'reload') view.webContents.reloadIgnoringCache()
    else if (action === 'share') { const url = view.webContents.getURL(); clipboard.writeText(C.websiteURL(url) ? url : C.SITE + '/'); status.message = 'تم نسخ رابط المشاركة.'; sendState() }
    else if (action === 'stop') stopAudio()
    else throw new Error('الطلب غير متاح.')
    return localState()
  }
  if (page === '/ui/player.html' && action === 'audioEnded') { if (payload?.generation === audioGeneration) { audioPlaying = false; sendState() } return true }
  if (page === '/ui/settings.html') {
    if (action === 'saveSettings') {
      const updated = C.settings(payload, voices), before = C.calendarIdentity(settings)
      if (process.platform === 'win32' && updated.openAtLogin !== settings.openAtLogin) {
        if (!app.isPackaged) throw new Error('التشغيل عند تسجيل الدخول يحتاج النسخة المثبتة من سميع.');
        app.setLoginItemSettings(P.loginOptions(updated.openAtLogin, process.execPath))
      }
      settings = updated; store.settings = settings
      if (before !== C.calendarIdentity(settings)) { store.calendar = []; store.calendarIdentity = ''; calendarError = '' }
      if (!settings.prayer || !settings.fullAdhan) stopAudio()
      persist(); reschedule(); void refreshCalendar(); return localState()
    }
    if (action === 'testNotification') { deliver('hadith', true); return localState() }
    if (action === 'preview') { await playVoice(payload?.id, payload?.volume); return localState() }
    if (action === 'stop') { stopAudio(); return localState() }
    if (action === 'refreshCalendar') { await refreshCalendar(true); return localState() }
    if (action === 'notificationSettings' && process.platform === 'win32') { await shell.openExternal('ms-settings:notifications'); return localState() }
  }
  throw new Error('الطلب غير متاح.')
})
ipcMain.on('samee3:reminders', event => { if (view && event.sender === view.webContents && event.senderFrame === event.sender.mainFrame && C.websiteURL(event.senderFrame.url)) void navigate('settings') })
function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'ui/logo.png')).resize({ width: 24, height: 24 }))
    tray.setToolTip('مصحف سميع — التذكيرات والأذان')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'فتح مصحف سميع', click: show },
      { label: 'المصحف المحفوظ', click: () => { show(); void navigate('reader') } },
      { label: 'التذكيرات والأذان', click: () => { show(); void navigate('settings') } },
      { label: 'ويدجت عائمة على سطح المكتب', click: showWidgetWindow },
      { label: 'تخصيص الويدجت', click: () => { show(); void navigate('/widgets') } },
      { label: 'إيقاف الأذان', click: stopAudio }, { type: 'separator' },
      { label: 'إنهاء سميع', click: () => app.quit() },
    ]))
    tray.on('click', show); tray.on('double-click', show)
  } catch { tray = null; status.message = 'تعذر إنشاء أيقونة الخلفية؛ اترك نافذة سميع مفتوحة لاستمرار التذكيرات.' }
}
function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'سميع', submenu: [
      { label: 'الرئيسية', click: () => { show(); void navigate('/') }, accelerator: 'CmdOrCtrl+1' },
      { label: 'المصحف المحفوظ', click: () => { show(); void navigate('reader') }, accelerator: 'CmdOrCtrl+2' },
      { label: 'التذكيرات والأذان', click: () => { show(); void navigate('settings') }, accelerator: 'CmdOrCtrl+,' },
      { label: 'إيقاف الأذان', click: stopAudio, accelerator: 'CmdOrCtrl+Shift+S' },
      { type: 'separator' },
      { label: 'ويدجت عائمة على سطح المكتب', click: showWidgetWindow, accelerator: 'CmdOrCtrl+Shift+W' },
      { label: 'تخصيص الويدجت', click: () => { show(); void navigate('/widgets') } },
      { label: 'صفحة التحميل وأحدث إصدار', click: () => safeExternal(C.SITE + '/downloads') },
      { label: 'إخفاء بجانب الساعة', click: () => { if (tray) win.hide(); else win.minimize() } },
      { type: 'separator' }, { label: 'إنهاء سميع', accelerator: 'Alt+F4', click: () => app.quit() },
    ] },
    { label: 'تحرير', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'عرض', submenu: [
      { label: 'تحديث الصفحة', click: () => view.webContents.reloadIgnoringCache(), accelerator: 'CmdOrCtrl+R' },
      { label: 'تكبير', click: () => view.webContents.setZoomLevel(Math.min(5, view.webContents.getZoomLevel() + 0.5)), accelerator: 'CmdOrCtrl+=' },
      { label: 'تصغير', click: () => view.webContents.setZoomLevel(Math.max(-3, view.webContents.getZoomLevel() - 0.5)), accelerator: 'CmdOrCtrl+-' },
      { label: 'الحجم الأصلي', click: () => view.webContents.setZoomLevel(0), accelerator: 'CmdOrCtrl+0' },
      { role: 'togglefullscreen', label: 'ملء الشاشة' }, { role: 'minimize', label: 'تصغير النافذة' },
    ] },
    { label: 'مساعدة', submenu: [{ label: 'حول مصحف سميع', click: () => void dialog.showMessageBox(win, { type: 'info', title: 'مصحف سميع', message: 'مصحف سميع لويندوز ' + app.getVersion(), detail: 'القرآن المحفوظ بالروايات السبع، والموقع الأصلي والتذكيرات والأذان.\nالتذكيرات تعمل أثناء بقاء التطبيق شغالًا، حتى عند إخفائه بجانب الساعة.' }) }] },
  ]))
}
async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 900, minWidth: 760, minHeight: 600, backgroundColor: '#f8f5ee', title: 'مصحف سميع', show: false, autoHideMenuBar: false, icon: nativeImage.createFromPath(path.join(ROOT, 'ui/logo.png')), webPreferences: localPreferences })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  view = new WebContentsView({ webPreferences: { ...localPreferences, backgroundThrottling: false } }); win.contentView.addChildView(view); sizeView()
  installNavigation(view.webContents)
  win.on('resize', sizeView)
  win.on('close', event => { if (tray && !quitting) { event.preventDefault(); win.hide() } })
  win.on('closed', () => { if (view && !view.webContents.isDestroyed()) view.webContents.close(); win = null; view = null })
  await win.loadURL(LOCAL + 'shell.html')
  if (!P.hiddenStart(process.argv) || !tray) show()
  const online = navigate('/')
  const timeout = setTimeout(() => { if (status.busy && C.websiteURL(view?.webContents.getURL() || C.SITE)) void offline('الاتصال بالموقع بطيء. يمكنك القراءة محليًا الآن أو فتح الرئيسية مرة أخرى.') }, 18000)
  await online; clearTimeout(timeout)
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', show)
  app.on('before-quit', () => { quitting = true; closeWidgetWindow(); stopAudio(); if (tray) { tray.destroy(); tray = null } })
  app.on('window-all-closed', () => { if (!tray) app.quit() })
  app.whenReady().then(async () => {
    readStore(); await configureSession(); menu(); createTray(); await createWindow(); reschedule(); void refreshCalendar()
    setInterval(tick, 20000).unref(); setInterval(() => void refreshCalendar(), 12 * 3600000).unref()
    powerMonitor.on('resume', () => { tick(); reschedule(); void refreshCalendar() })
    app.on('activate', async () => { if (!win) await createWindow(); else show() })
  }).catch(error => { dialog.showErrorBox('تعذر فتح مصحف سميع', String(error.message)); app.quit() })
}
