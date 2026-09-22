# Force-stop Tablewhisper / DM Console terminals and free ports.
$ErrorActionPreference = 'SilentlyContinue'
$Ports = @(8766, 5173)
$TitlePrefix = '^(DM API|DM UI|DM Discord|DM Console)'

function Stop-Tree([int]$ProcessId) {
  if ($ProcessId -le 4) { return }
  & taskkill.exe /F /T /PID $ProcessId 2>$null | Out-Null
  try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

function Get-ParentId([int]$ProcessId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($p) { return [int]$p.ParentProcessId }
  return 0
}

# 1) Close any visible window whose title is a DM Console terminal
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DmWinKill {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  public static List<uint> Find(string pattern) {
    var rx = new System.Text.RegularExpressions.Regex(pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    var ids = new List<uint>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var t = sb.ToString();
      if (string.IsNullOrEmpty(t) || !rx.IsMatch(t)) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid > 4) ids.Add(pid);
      return true;
    }, IntPtr.Zero);
    return ids;
  }
}
"@

foreach ($pid in [DmWinKill]::Find($TitlePrefix)) {
  Write-Host "  force-close window pid=$pid"
  Stop-Tree ([int]$pid)
}

# 2) For each listen port: kill listener + walk parents to cmd/OpenConsole and kill that tree
foreach ($port in $Ports) {
  $owners = @(
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  foreach ($pid in $owners) {
    if (-not $pid) { continue }
    Write-Host "  port $port listener pid=$pid"
    $cur = [int]$pid
    $cmdPid = $null
    for ($i = 0; $i -lt 10 -and $cur -gt 4; $i++) {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$cur" -ErrorAction SilentlyContinue
      if (-not $proc) { break }
      $name = ($proc.Name + '').ToLowerInvariant()
      if ($name -in @('cmd.exe', 'powershell.exe', 'pwsh.exe', 'openconsole.exe')) {
        $cmdPid = $cur
        break
      }
      if ($name -eq 'windowsterminal.exe') {
        # Don't kill the whole Terminal app; stop at previous child if any
        break
      }
      $cur = [int]$proc.ParentProcessId
    }
    if ($cmdPid) {
      Write-Host "  force-close console pid=$cmdPid"
      Stop-Tree $cmdPid
    }
    Stop-Tree ([int]$pid)
  }
}

# 3) Project-scoped leftovers by command line
$markers = @(
  'uvicorn.+app\.main:app',
  'apps[\\/]desktop.+vite',
  'apps[\\/]discord-bot.+bot\.py',
  'discord-bot.+bot\.py'
)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
  $cl = $_.CommandLine
  if (-not $cl) { return }
  foreach ($m in $markers) {
    if ($cl -match $m) {
      Write-Host "  force-close by cmdline pid=$($_.ProcessId) ($($_.Name))"
      Stop-Tree ([int]$_.ProcessId)
      break
    }
  }
}

# 4) Final port sweep
foreach ($port in $Ports) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Tree ([int]$_.OwningProcess) }
}

Write-Host "Done."
