@echo off
setlocal
cd /d "%~dp0..\native\windows"
call Build-Windows.cmd
exit /b %ERRORLEVEL%
