# Stop the DM Console API and start it again. Leaves the UI running.
$ErrorActionPreference = 'SilentlyContinue'
$root = $env:DM_LAUNCH_ROOT
$port = $env:DM_LAUNCH_PORT
if (-not $root -or -not $port) {
  $root = Split-Path $PSScriptRoot -Parent
  if (-not $port) { $port = '8766' }
}
$root = $root.Trim().Trim('"').TrimEnd('\')
$portNum = [int]$port
$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$apiLog = Join-Path $logDir 'api.log'
$api = Join-Path $root 'apps\api'
$py = Join-Path $api '.venv\Scripts\python.exe'

if (-not (Test-Path $py)) {
  Write-Host "  [!] Missing API venv. Run menu option 2 first."
  exit 1
}

function Stop-Tree([int]$ProcessId) {
  if ($ProcessId -le 4) { return }
  & taskkill.exe /F /T /PID $ProcessId 2>$null | Out-Null
}

Write-Host "  Stopping the API on port $portNum..."
$killed = New-Object System.Collections.Generic.List[int]

Get-CimInstance Win32_Process | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  if ($cmd -match 'run-api\.cmd' -or $cmd -match 'uvicorn.+app\.main:app') {
    $killed.Add([int]$_.ProcessId)
    Stop-Tree ([int]$_.ProcessId)
  }
}

$listeners = @()
$listeners += @(netstat -ano | Select-String ":$portNum\s" | Select-String 'LISTENING')
foreach ($line in $listeners) {
  $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
  $owner = 0
  [void][int]::TryParse($parts[-1], [ref]$owner)
  if ($owner -gt 4) {
    $killed.Add($owner)
    Stop-Tree $owner
  }
}

Get-CimInstance Win32_Process | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd -or $cmd -notmatch 'spawn_main\(parent_pid=(\d+)') { return }
  $parent = [int]$Matches[1]
  $parentGone = -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)
  if ($parentGone -or $killed.Contains($parent)) {
    Stop-Tree ([int]$_.ProcessId)
  }
}

Start-Sleep -Milliseconds 600

try {
  Set-Content -Path $apiLog -Value '' -Encoding utf8 -ErrorAction Stop
} catch {
  # The old process may still be releasing the log. The new server appends.
}

$apiBat = Join-Path $logDir 'run-api.cmd'
@(
  '@echo off',
  "cd /d `"$api`"",
  "`"$py`" -m uvicorn app.main:app --host 127.0.0.1 --port $port --reload > `"$apiLog`" 2>&1"
) | Set-Content -Path $apiBat -Encoding ascii

Write-Host "  Starting the API..."
Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList "/c `"$apiBat`""

$ready = $false
for ($i = 0; $i -lt 25; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$portNum/health" -TimeoutSec 2
    if ($health) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 1
}

if ($ready) {
  Write-Host "  [OK] API is up at http://127.0.0.1:$portNum/health"
  Write-Host "       Hard-refresh the browser (Ctrl+F5) if the page still shows an old error."
  exit 0
}

Write-Host "  [!] API did not answer. See data\logs\api.log"
exit 1
