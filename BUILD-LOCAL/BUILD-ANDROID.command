#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../native/android"
if [[ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  echo 'ERROR: Android SDK is required. Install Android Studio and set ANDROID_HOME.' >&2; exit 2
fi
if [[ -z "${SAMEE3_KEYSTORE_PATH:-}" || -z "${SAMEE3_STORE_PASSWORD:-}" || -z "${SAMEE3_KEY_ALIAS:-}" || -z "${SAMEE3_KEY_PASSWORD:-}" ]]; then
  echo 'ERROR: Existing Android signing keystore credentials required to update installed Samee3 APK.' >&2
  echo 'Do not distribute an unsigned or debug APK as an update.' >&2
  exit 3
fi
if [[ ! -f "$SAMEE3_KEYSTORE_PATH" ]]; then echo 'ERROR: Keystore file not found' >&2; exit 3; fi
if [[ -x ./gradlew ]]; then ./gradlew --no-daemon --stacktrace :app:assembleRelease
elif command -v gradle >/dev/null 2>&1; then gradle --no-daemon --stacktrace :app:assembleRelease
else echo 'ERROR: Gradle or Gradle wrapper missing. Open native/android in Android Studio to build.' >&2; exit 4
fi
echo 'Release APK available at native/android/app/build/outputs/apk/release/'
