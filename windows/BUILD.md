# SAMEE3 Windows 1.1.0 — x64

This source is independent of the Next.js website and belongs in `native/windows/`.
The ready installer includes its runtime; end users do not install Node.js or Electron.

## Build on Windows

Use Node.js 24. Open this folder, run `Build-Windows.cmd`, or run:

```powershell
npm ci
npm test
npm run dist:windows
```

Output: `dist/Samee3-Windows-1.1.0-x64-Setup.exe`.
Do not replace the website root's package.json with this package file.
Do not commit node_modules or dist. Publish the final installer as a GitHub Release asset.

Electron 45.1.0 and electron-builder 26.18.0 are pinned in package.json and package-lock.json.
The installer targets Windows 10/11 x64 (Intel/AMD), installs for the current user,
creates branded desktop/Start-menu shortcuts, and preserves reading preferences on uninstall.
`com.samee3.windows` is the installer AppUserModelId and the running application's ID.

The published installer is unsigned: no publisher certificate was available.
Signing requires a real Windows publisher certificate or supported signing service.
No certificate, login credential, account or secret is bundled.

## Linux packaging used for this delivery

`tools/build-linux.cjs` uses the stock electron-builder NSIS template and its
`UninstallerReader` fallback to assemble the unsigned uninstaller without running
a Windows process. This is the same reader the pinned builder supplies for hosts
that cannot run the 32-bit NSIS writer. Windows users should use the normal command above.

```sh
node tools/build-linux.cjs /absolute/path/to/verified-unpacked-win32-x64-electron
```

The official runtime was checked against Electron's SHASUMS256.txt. Verification
checks NSIS and its nested archive/uninstaller, the application's x64 PE header,
and the bytes of all 69 application code/data/font/audio files after extracting
the actual installer. Runtime fingerprints and limits are in verification/.

## Behavior and validation limits

The original site is sandboxed with Node disabled, context isolation and permission
checks. Local IPC is limited to known commands from the application's main frames.
Settings, bookmarks and reader data stay on this computer. The offline reader
contains all seven original readings and bundled fonts. Online website sections
retain the live site's design and need network according to their content.

Closing the window hides it to the system tray while reminder timers continue.
Exit stops the application. Reminders do not wake sleeping or powered-off computers.
Starting at Windows sign-in is optional and only configured after the user enables it.
Twenty muezzins plus a separate Fajr recording are bundled. Prayer calendars preserve
the provider's UTC offsets and cache three months after a successful download.

Native Windows installation, toast delivery and startup registration were not run
on a real Windows machine in this environment. The real Electron Linux runtime
was used to exercise the UI, all readings through page604, fonts, search, bookmark,
copy, persistence, reminder settings, audio stop and desktop resizing. Only that
private Linux harness replaces AF_UNIX single-instance locking, which the managed
test host disallows; the shipped Windows app retains the native lock.

Primary sources:
- https://github.com/electron/electron/releases/tag/v45.1.0
- https://github.com/electron/electron/blob/main/README.md
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electron.build/nsis.html
