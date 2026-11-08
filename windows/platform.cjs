const APP_ID = 'com.samee3.windows'
function loginOptions(enabled, executable) {
  if (typeof enabled !== 'boolean' || typeof executable !== 'string' || !executable || executable.includes('\0')) throw new Error('Invalid login settings')
  return { openAtLogin: enabled, path: executable, args: ['--hidden'] }
}
function hiddenStart(argv) { return Array.isArray(argv) && argv.includes('--hidden') }
module.exports = { APP_ID, loginOptions, hiddenStart }
