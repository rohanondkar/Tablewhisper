# Start the API and UI with no console window. Output goes to data\logs.
# Paths come from the environment so a trailing backslash in the launcher
# folder cannot swallow the port argument.
$ErrorActionPreference = 'Stop'
$root = $env:DM_LAUNCH_ROOT
$port = $env:DM_LAUNCH_PORT
if (-not $root -or -not $port) {
  throw "DM_LAUNCH_ROOT and DM_LAUNCH_PORT must be set by start-dev.bat"
}
$root = $root.Trim().Trim('"').TrimEnd('\')
$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# The hidden cmd that redirects into these logs keeps the files locked.
# Stop that cmd (and uvicorn / vite) before replacing the logs.
$patterns = @(
  'run-api\.cmd',
  'run-ui\.cmd',
  'uvicorn.+app\.main:app',
  'npm\.cmd run dev:ui',
  'apps\\desktop.*vite'
)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  foreach ($pattern in $patterns) {
    if ($cmd -match $pattern) {
      & taskkill.exe /F /T /PID $_.ProcessId 2>$null | Out-Null
      break
    }
  }
}
Start-Sleep -Milliseconds 500

$apiLog = Join-Path $logDir 'api.log'
$uiLog = Join-Path $logDir 'ui.log'
foreach ($log in @($apiLog, $uiLog)) {
  try {
    Set-Content -Path $log -Value '' -Encoding utf8 -ErrorAction Stop
  } catch {
    # A leftover process still has the file. Keep going and append on the next start.
  }
}

$api = Join-Path $root 'apps\api'
$ui = Join-Path $root 'apps\desktop'
$py = Join-Path $api '.venv\Scripts\python.exe'

$apiBat = Join-Path $logDir 'run-api.cmd'
$uiBat = Join-Path $logDir 'run-ui.cmd'
@(
  '@echo off',
  "cd /d `"$api`"",
  "`"$py`" -m uvicorn app.main:app --host 127.0.0.1 --port $port --reload > `"$apiLog`" 2>&1"
) | Set-Content -Path $apiBat -Encoding ascii
@(
  '@echo off',
  "cd /d `"$ui`"",
  "npm.cmd run dev:ui > `"$uiLog`" 2>&1"
) | Set-Content -Path $uiBat -Encoding ascii

Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList "/c `"$apiBat`""
Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList "/c `"$uiBat`""
