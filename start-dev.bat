@echo off
title DM Console Launcher
color 0A
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
set "API_PORT=8766"
cd /d "%ROOT%"

:menu
cls
echo.
echo  ================================================================
echo   DM CONSOLE
echo  ================================================================
echo.
echo   UI:     http://127.0.0.1:5173
echo   API:    http://127.0.0.1:%API_PORT%/health
echo   Ollama: leave the Ollama app running  (ollama pull llama3.2)
echo.
echo  ----------------------------------------------------------------
echo   MENU
echo  ----------------------------------------------------------------
echo   1 ^) Start app   (API + UI + open browser once)     [recommended]
echo   2 ^) First-time setup   (venv + npm install)
echo   3 ^) Show all commands
echo   4 ^) Health check
echo   5 ^) Start Discord bot   (VC listen → API buffer)
echo   6 ^) Quit
echo  ----------------------------------------------------------------
echo.
set /p CHOICE=  Pick 1-6: 

if "%CHOICE%"=="1" goto start
if "%CHOICE%"=="2" goto setup
if "%CHOICE%"=="3" goto commands
if "%CHOICE%"=="4" goto health
if "%CHOICE%"=="5" goto discord_bot
if "%CHOICE%"=="6" exit /b 0
goto menu

:setup
echo.
echo  [SETUP] API venv...
pushd "%ROOT%apps\api"
if not exist ".venv\Scripts\python.exe" python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
popd
echo  [SETUP] Desktop npm...
pushd "%ROOT%apps\desktop"
call npm.cmd install
popd
echo.
echo  [OK] Setup finished.
pause
goto menu

:commands
cls
echo.
echo  ================================================================
echo   COPY/PASTE COMMANDS  (use Command Prompt / cmd)
echo  ================================================================
echo.
echo  --- First-time setup ---
echo   cd /d "%ROOT%apps\api"
echo   python -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
echo.
echo   cd /d "%ROOT%apps\desktop"
echo   npm.cmd install
echo.
echo  --- Start API ---
echo   cd /d "%ROOT%apps\api"
echo   .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %API_PORT% --reload
echo.
echo  --- Start UI ---
echo   cd /d "%ROOT%apps\desktop"
echo   npm.cmd run dev:ui
echo.
echo  --- Discord bot (Developer Portal VC listen) ---
echo   cd /d "%ROOT%apps\discord-bot"
echo   copy discord.example.json discord.json
echo   python -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
echo   .venv\Scripts\python.exe bot.py
echo.
echo  --- Electron (Ctrl+N voice) ---
echo   cd /d "%ROOT%apps\desktop"
echo   set DM_API_PORT=%API_PORT%
echo   npm.cmd run dev
echo.
echo  --- PowerShell (no /d) ---
echo   cd "%ROOT%apps\desktop"
echo   npm.cmd run dev:ui
echo.
echo  --- Ollama ---
echo   ollama pull llama3.2
echo.
pause
goto menu

:discord_bot
echo.
set "CURL=curl.exe"
where curl.exe >nul 2>&1
if errorlevel 1 set "CURL=curl"
"%CURL%" -sf --connect-timeout 2 "http://127.0.0.1:%API_PORT%/health" >nul 2>&1
if errorlevel 1 (
  echo  [!] API is not running on port %API_PORT%.
  echo      Start option 1 first, then come back for the Discord bot.
  pause
  goto menu
)
if not exist "%ROOT%apps\discord-bot\discord.json" (
  echo  [!] Missing apps\discord-bot\discord.json
  echo      Copy discord.example.json → discord.json and paste your Developer Portal token.
  echo      Guide: apps\discord-bot\README.md
  echo      Portal: https://discord.com/developers/applications
  pause
  goto menu
)
if not exist "%ROOT%apps\discord-bot\.venv\Scripts\python.exe" (
  echo  [SETUP] Discord bot venv...
  pushd "%ROOT%apps\discord-bot"
  python -m venv .venv
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  popd
)
echo  Starting Discord VC bot...
start "DM Discord Bot" cmd /k "cd /d "%ROOT%apps\discord-bot" && title DM Discord Bot && echo. && echo  Discord VC → http://127.0.0.1:%API_PORT%/voice/discord/ingest && echo  In Discord: !join / !leave  ^(Ctrl+N resolves in the app^) && echo. && .venv\Scripts\python.exe bot.py"
echo  [OK] Discord bot window opened.
pause
goto menu

:health
echo.
echo  ================================================================
echo   HEALTH CHECK
echo  ================================================================
echo.

REM Prefer curl.exe so PowerShell's curl alias never interferes if launched oddly.
set "CURL=curl.exe"
where curl.exe >nul 2>&1
if errorlevel 1 set "CURL=curl"

echo  API  http://127.0.0.1:%API_PORT%/health
"%CURL%" -s -S --connect-timeout 2 --max-time 5 "http://127.0.0.1:%API_PORT%/health" > "%TEMP%\dm_health.json" 2> "%TEMP%\dm_health.err"
if errorlevel 1 (
  echo    [DOWN]  API not reachable on port %API_PORT%
  echo            Start the app with menu option 1 first.
  if exist "%TEMP%\dm_health.err" type "%TEMP%\dm_health.err"
) else (
  echo    [UP]    API responded:
  type "%TEMP%\dm_health.json"
  echo.
)

echo.
echo  STATUS  http://127.0.0.1:%API_PORT%/status
"%CURL%" -s -S --connect-timeout 2 --max-time 8 "http://127.0.0.1:%API_PORT%/status" > "%TEMP%\dm_status.json" 2>nul
if errorlevel 1 (
  echo    [DOWN]  /status unavailable
) else (
  echo    [UP]    Runtime status:
  type "%TEMP%\dm_status.json"
  echo.
)

echo.
echo  UI  http://127.0.0.1:5173/
"%CURL%" -s -S -o nul --connect-timeout 2 --max-time 5 -w "%%{http_code}" "http://127.0.0.1:5173/" > "%TEMP%\dm_ui_code.txt" 2>nul
set /p UI_CODE=<"%TEMP%\dm_ui_code.txt"
if "%UI_CODE%"=="200" (
  echo    [UP]    Vite UI responding ^(HTTP %UI_CODE%^)
) else if "%UI_CODE%"=="304" (
  echo    [UP]    Vite UI responding ^(HTTP %UI_CODE%^)
) else (
  echo    [DOWN]  UI not reachable on 5173 ^(HTTP %UI_CODE%^)
  echo            Start the app with menu option 1 first.
)

echo.
echo  SESSIONS  http://127.0.0.1:%API_PORT%/sessions
"%CURL%" -s -S --connect-timeout 2 --max-time 5 "http://127.0.0.1:%API_PORT%/sessions" > "%TEMP%\dm_sessions.json" 2>nul
if errorlevel 1 (
  echo    [DOWN]  /sessions unavailable
) else (
  echo    [UP]
  type "%TEMP%\dm_sessions.json"
  echo.
)

echo.
echo  ----------------------------------------------------------------
pause
goto menu

:start
echo.
if not exist "%ROOT%apps\api\.venv\Scripts\python.exe" (
  echo  [!] Missing API venv. Running setup first...
  call :setup
)

if not exist "%ROOT%apps\desktop\node_modules" (
  echo  [!] Missing node_modules. Running npm install...
  pushd "%ROOT%apps\desktop"
  call npm.cmd install
  popd
)

echo  Freeing ports %API_PORT% and 5173 if needed...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :%API_PORT% ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1
timeout /t 2 /nobreak >nul

echo  Starting API on port %API_PORT%...
start "DM API :%API_PORT%" cmd /k "cd /d "%ROOT%apps\api" && title DM API :%API_PORT% && echo. && echo  API  http://127.0.0.1:%API_PORT%/health && echo  Docs http://127.0.0.1:%API_PORT%/docs && echo. && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %API_PORT% --reload"

echo  Starting UI on port 5173...
start "DM UI :5173" cmd /k "cd /d "%ROOT%apps\desktop" && title DM UI :5173 && echo. && echo  UI http://127.0.0.1:5173 && echo  (Do NOT press o — the launcher opens the browser for you.) && echo. && npm.cmd run dev:ui"

echo  Waiting for UI to be ready...
set "READY=0"
for /L %%I in (1,1,30) do (
  curl -sf http://127.0.0.1:5173/ >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto ui_ready
  )
  timeout /t 1 /nobreak >nul
)
:ui_ready

echo  Opening browser once...
start "" "http://127.0.0.1:5173"

echo.
echo  [OK] App started.
echo   - Keep the API and UI console windows open ^(they are not the app^).
echo   - You do NOT need to press o in the Vite window — that would open a second tab.
echo   - Hard-refresh the browser ^(Ctrl+F5^) if you still see old errors.
echo.
pause
goto menu
