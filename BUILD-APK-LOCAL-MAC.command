#!/bin/bash
# Samee3 Android — local build without GitHub Actions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/native/android"
if [ ! -f "$APP/gradlew" ]; then
  echo 'ملف native/android/gradlew غير موجود: يجب العمل داخل مستودع سميع الكامل، وليس داخل ZIP التحديث فقط.'
  exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
if [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  echo 'Android SDK Platform 35 غير متوفر. ثبته من Android Studio > SDK Manager.'
  exit 1
fi
if [ -x /usr/libexec/java_home ]; then
  JAVA17="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
  JAVA21="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  if [ -n "$JAVA17" ]; then export JAVA_HOME="$JAVA17";
  elif [ -n "$JAVA21" ]; then export JAVA_HOME="$JAVA21"; fi
fi
printf '\n1) نسخة تجريبية منفصلة Preview\n2) تحديث موقّع (يتطلب مفتاح التوقيع الأصلي)\nاختيارك [1/2]: '
read -r CHOICE
cd "$APP"
chmod +x ./gradlew
if [ "$CHOICE" = '1' ]; then
  ./gradlew --no-daemon assembleDebug
  echo "تم البناء: $APP/app/build/outputs/apk/debug/app-debug.apk"
elif [ "$CHOICE" = '2' ]; then
  echo 'استخدم ملف التوقيع الأصلي؛ أي مفتاح جديد لن يحدّث التطبيق المثبّت.'
  printf 'المسار الكامل لملف keystore الأصلي: '
  read -r KEYSTORE
  if [ ! -f "$KEYSTORE" ]; then echo 'ملف keystore غير موجود';exit 1;fi
  printf 'اسم مفتاح التوقيع (alias): '
  read -r ALIAS
  printf 'كلمة سر المخزن: '
  read -r -s STORE_PASSWORD
  echo
  printf 'كلمة سر المفتاح: '
  read -r -s KEY_PASSWORD
  echo
  export SAMEE3_KEYSTORE_PATH="$KEYSTORE"
  export SAMEE3_STORE_PASSWORD="$STORE_PASSWORD"
  export SAMEE3_KEY_ALIAS="$ALIAS"
  export SAMEE3_KEY_PASSWORD="$KEY_PASSWORD"
  ./gradlew --no-daemon assembleRelease
  unset STORE_PASSWORD KEY_PASSWORD SAMEE3_STORE_PASSWORD SAMEE3_KEY_PASSWORD
  APK="$APP/app/build/outputs/apk/release/app-release.apk"
  if [ ! -f "$APK" ]; then echo 'لم ينتج ملف APK موقّع';exit 1;fi
  echo "تم البناء: $APK"
  echo 'تحقق من صحة توقيع النسخة الجديدة ومطابقته لتوقيع النسخة القديمة قبل التثبيت.'
else echo 'اختيار غير صحيح';exit 1;fi
