#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../native/macos"
if [[ "$(uname -s)" != "Darwin" ]]; then echo 'ERROR: macOS is required to package a native Mac app.' >&2; exit 2; fi
for commandName in npm python3 codesign ditto; do
  if ! command -v "$commandName" >/dev/null 2>&1; then echo "ERROR: $commandName is required" >&2; exit 3; fi
done
npm ci
npm test
if [[ ! -d node_modules/electron/dist/Electron.app ]]; then echo 'ERROR: Electron.app runtime missing after npm ci' >&2; exit 4; fi
VERSION="$(node -p 'require("./package.json").version')"
ARCH="$(uname -m)"
OUTPUT="${PWD}/dist"
APP="$OUTPUT/Samee3.app"
mkdir -p "$OUTPUT"
rm -rf "$APP"
# Copy the official Electron binary for this Mac CPU (arm64 on Apple Silicon, x86_64 on Intel).
ditto node_modules/electron/dist/Electron.app "$APP"
RES="$APP/Contents/Resources"
rm -rf "$RES/default_app.asar" "$RES/default_app.asar.unpacked"
mkdir -p "$RES/app"
for source in main.cjs core.cjs preload.cjs widgets-window.cjs package.json; do cp "$source" "$RES/app/"; done
for folder in ui data; do ditto "$folder" "$RES/app/$folder"; done
cp ui/app.icns "$RES/app.icns"
# Preserve the same bundle ID as the original Mac installer.
P=/usr/libexec/PlistBuddy
"$P" -c 'Set :CFBundleIdentifier app.samee3.mac' "$APP/Contents/Info.plist"
"$P" -c 'Set :CFBundleName Samee3' "$APP/Contents/Info.plist"
"$P" -c 'Set :CFBundleDisplayName مصحف سميع' "$APP/Contents/Info.plist"
"$P" -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist"
"$P" -c "Set :CFBundleVersion $(date +%Y%m%d)" "$APP/Contents/Info.plist"
"$P" -c 'Add :CFBundleIconFile string app.icns' "$APP/Contents/Info.plist" 2>/dev/null || "$P" -c 'Set :CFBundleIconFile app.icns' "$APP/Contents/Info.plist"
# Ad-hoc codesign is for local/test distribution only; it is NOT Apple notarization.
codesign --force --deep --sign - "$APP"
codesign --verify --deep --verbose=2 "$APP"
ARCHIVE="$OUTPUT/Samee3-Mac-${VERSION}-${ARCH}-ad-hoc.zip"
rm -f "$ARCHIVE"
ditto -c -k --keepParent "$APP" "$ARCHIVE"
echo "Created: $ARCHIVE"
echo 'IMPORTANT: This is AD-HOC signed and NOT Apple-notarized. Test on a real Mac before public release.'
