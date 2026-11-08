#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../native-widgets/ios"
if [[ "$(uname -s)" != "Darwin" ]]; then echo 'Xcode on macOS is required'; exit 2; fi
if ! command -v xcodegen >/dev/null 2>&1 || ! command -v xcodebuild >/dev/null 2>&1; then echo 'Install Xcode and XcodeGen'; exit 3; fi
xcodegen generate
xcodebuild -project Samee3.xcodeproj -scheme Samee3App -configuration Release -sdk iphonesimulator -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
printf '%s\n' 'Simulator build complete. Real iOS distribution requires your Apple signing team, profile, and archive/export.'
