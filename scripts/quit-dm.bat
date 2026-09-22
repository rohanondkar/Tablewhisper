@echo off
REM Stop DM Console API/UI/Discord terminals and free ports 8766 / 5173.
setlocal EnableExtensions

REM Close titled console windows from start-dev.bat
taskkill /FI "WINDOWTITLE eq DM API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DM UI*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DM Discord*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DM Console*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DM CONSOLE*" /T /F >nul 2>&1

REM Kill listeners on API + Vite ports
for %%P in (8766 5173) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /F /PID %%A /T >nul 2>&1
  )
)

exit /b 0
