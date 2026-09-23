# Open the console, or bring the window that is already open to the front.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DmConsoleOnce {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);

  static IntPtr found;

  public static IntPtr Find() {
    found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var t = sb.ToString();
      if (t.StartsWith("DM Console") && t.IndexOf("Launcher", StringComparison.OrdinalIgnoreCase) < 0) {
        found = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void BringToFront(IntPtr hWnd) {
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
    else ShowWindow(hWnd, 5);
    IntPtr fg = GetForegroundWindow();
    uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint thisThread = GetCurrentThreadId();
    AttachThreadInput(thisThread, fgThread, true);
    SetForegroundWindow(hWnd);
    AttachThreadInput(thisThread, fgThread, false);
  }
}
"@

$window = [DmConsoleOnce]::Find()
if ($window -ne [IntPtr]::Zero) {
  [DmConsoleOnce]::BringToFront($window)
  Write-Output "Brought the open DM Console window to the front."
  exit 0
}
Start-Process "http://127.0.0.1:5173"
Write-Output "Opened http://127.0.0.1:5173"
