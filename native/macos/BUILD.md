# SAMEE3 macOS 1.1.0

The distributed ZIPs already contain a complete `Samee3.app`. End users do not need Node, Xcode or a compiler. `README-AR.txt` contains installation and feature details.

## Development

This source lives in `native/macos/` when merged into the SAMEE3 repository. Its `package.json` is independent of the website's package file.

```sh
npm ci
npm test
npm start
```

Electron is pinned to 45.1.0. Use Node 22.12+ or Node 24. The local data and fonts are bundled, with provenance and licenses in `data/`. The app's online sections use `https://samee3.vercel.app`.

## Reproducing the app bundles

Download the official Electron 45.1.0 Darwin runtime ZIP for `arm64` or `x64` and validate it against Electron's `SHASUMS256.txt`. Obtain the Apple Codesign `rcodesign` tool matching the build host. The exact versions and runtime fingerprints used here are recorded in `verification/toolchain-lock.json`.

```sh
python3 tools/package-mac.py \
  --runtime /absolute/path/electron-v45.1.0-darwin-arm64.zip \
  --arch arm64 \
  --rcodesign /absolute/path/rcodesign \
  --output /absolute/path/output \
  --work /absolute/path/new-empty-work-folder
```

Use the x64 runtime and `--arch x64` for Intel. Packaging prepares an unsigned staging bundle and signs into a separate output directory. Do not sign in place over the extracted original runtime or reuse failed staging folders. Framework symlinks and file modes must be preserved.

The packager adds helper executable metadata, app branding and usage descriptions, bundles Electron/Chromium notices, signs recursively ad hoc, verifies every Mach-O CodeDirectory/code-page digest and bundle seals independently, compares bundled Quran/font/audio bytes with source, and checks the final ZIP's integrity. `tools/verify-macho.py` performs hash validation; it does not claim Gatekeeper approval or notarization.

This release is **ad-hoc signed, not Developer ID signed, and not notarized**. A verified Developer ID identity and Apple notarization workflow are separate publishing steps. No private certificates or account credentials are included.

## Runtime behavior

The remote site is sandboxed with Node disabled, context isolation and origin checks. Local IPC accepts a bounded command set only from the app's own main frames. Local resources are restricted to the `ui/` and `data/` directories. Website downloads use a system save dialog; other website links open in the system browser. Supported Firebase/Google authentication popups remain sandboxed.

Settings and reading positions remain local. Reminder timers operate while the app runs, including when its macOS window is hidden. They do not run after Quit and do not wake a sleeping Mac. Calendar timestamps preserve the provider's explicit UTC offset. Full adhan plays only for selected prayer settings, and cancelling preparation prevents late playback.

The UI was exercised in the actual Linux Electron runtime, including all seven readings, page604, fonts, search, bookmarking, copy, preferences, audio preparation/stop and window sizes. This does not constitute real macOS execution, notification-permission, login-provider or hardware testing. macOS 13+ is required by the selected runtime.

Official runtime and signing sources:

- https://github.com/electron/electron/releases/tag/v45.1.0
- https://github.com/indygreg/apple-platform-rs/releases/tag/apple-codesign%2F0.29.0
