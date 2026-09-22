@echo off
REM Force-close DM Console API/UI/Discord terminals and free ports 8766 / 5173.
setlocal EnableExtensions
cd /d "%~dp0.."

echo  Force-closing DM Console terminals...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0quit-dm.ps1"
set "ERR=%ERRORLEVEL%"
echo  Done.
exit /b %ERR%
