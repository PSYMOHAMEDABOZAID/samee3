const api = window.Samee3Mac
async function request(action, payload) { try { await api.request(action, payload) } catch (e) { document.getElementById('state').textContent = e.message } }
for (const button of document.querySelectorAll('[data-route]')) button.addEventListener('click', () => request('navigate', button.dataset.route))
for (const name of ['back','forward','reload','share','stop']) document.getElementById(name).addEventListener('click', () => request(name))
document.getElementById('sections').addEventListener('change', event => { if (event.target.value) void request('navigate', event.target.value); event.target.value = '' })
function show(state) {
  document.getElementById('back').disabled = !state.canBack; document.getElementById('forward').disabled = !state.canForward
  document.getElementById('stop').hidden = !state.audioPlaying
  document.getElementById('subtitle').textContent = 'نسخة الماك ' + state.version
  document.body.classList.toggle('busy', state.busy)
  document.getElementById('state').textContent = state.message || (state.busy ? 'جارٍ فتح الصفحة…' : state.offline ? 'هذه الصفحة محفوظة داخل التطبيق وتعمل دون إنترنت.' : 'تصميم موقع سميع الأساسي — محتوى الموقع يُحدّث من الإنترنت.')
  for (const button of document.querySelectorAll('[data-route]')) button.classList.toggle('current', state.route === button.dataset.route)
}
api.onState(show); api.request('status').then(show).catch(() => {})
