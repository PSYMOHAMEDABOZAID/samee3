#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../native-widgets/macos"
if [[ "$(uname -s)" != "Darwin" ]]; then echo 'Xcode on macOS is required'; exit 2; fi
if ! command -v xcodegen >/dev/null 2>&1 || ! command -v xcodebuild >/dev/null 2>&1; then echo 'Install Xcode and XcodeGen'; exit 3; fi
xcodegen generate
xcodebuild -project Samee3MacWidgets.xcodeproj -scheme Samee3MacApp -configuration Release -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
printf '%s\n' 'Unsigned macOS WidgetKit helper build complete. Public distribution needs signing/notarization.'
