# Open the console in the browser only when it is not already open.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DmConsoleOnce {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  public static bool AlreadyOpen() {
    bool found = false;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var t = sb.ToString();
      if (t.StartsWith("DM Console") && t.IndexOf("Launcher", StringComparison.OrdinalIgnoreCase) < 0) {
        found = true;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

if ([DmConsoleOnce]::AlreadyOpen()) {
  Write-Output "already-open"
  exit 0
}
Start-Process "http://127.0.0.1:5173"
Write-Output "opened"
