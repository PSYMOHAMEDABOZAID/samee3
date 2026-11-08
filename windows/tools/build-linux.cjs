// Build the unsigned Windows NSIS target without executing Windows programs.
// This uses electron-builder's own UninstallerReader (its supported macOS fallback).
// End users building on Windows should use npm run dist:windows instead.
const path = require('node:path')
const { build, Platform, Arch } = require('electron-builder')
const { WineVmManager } = require('app-builder-lib/out/vm/WineVm')
const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil')
const root = path.resolve(__dirname, '..')
WineVmManager.prototype.exec = async function (installer, args = []) {
  const file = path.resolve(installer)
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !file.endsWith('-Setup.exe') || args.length) throw new Error('Unexpected Windows build command')
  await UninstallerReader.exec(file, file.slice(0, -3) + '__uninstaller.exe')
  return ''
}
build({ projectDir: root, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  config: process.argv[2] ? { electronDist: path.resolve(process.argv[2]) } : {} })
  .catch(error => { console.error(error); process.exitCode = 1 })
