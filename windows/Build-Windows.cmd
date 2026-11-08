@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ثبّت Node.js 24 أولًا لبناء المصدر، ثم أعد فتح هذا الملف.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npm run dist:windows
if errorlevel 1 goto failed
echo.
echo تم البناء. ستجد ملف التثبيت داخل مجلد dist.
pause
exit /b 0
:failed
echo.
echo لم يكتمل البناء. راجع رسالة الخطأ أعلاه.
pause
exit /b 1
