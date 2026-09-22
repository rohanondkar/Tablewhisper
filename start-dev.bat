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
echo   5 ^) Quit
echo  ----------------------------------------------------------------
echo.
set /p CHOICE=  Pick 1-5: 

if "%CHOICE%"=="1" goto start
if "%CHOICE%"=="2" goto setup
if "%CHOICE%"=="3" goto commands
if "%CHOICE%"=="4" goto health
if "%CHOICE%"=="5" exit /b 0
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

:health
echo.
curl -s http://127.0.0.1:%API_PORT%/health
echo.
curl -s http://127.0.0.1:%API_PORT%/sessions
echo.
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
