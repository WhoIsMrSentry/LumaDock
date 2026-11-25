# LumaDock Window Tools: Always-on-Top Pin, Layered Opacity, and Click-Through Ghost Mode
param(
  [string]$Action = 'list',
  [string]$Hwnd = '0',
  [string]$Value = '',
  [int]$SkipPid = 0
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace LumaDockWinTools {
  public class WinItem {
    public string hwnd;
    public uint pid;
    public string process;
    public string title;
    public bool topmost;
    public bool ghost;
    public int opacity;
  }

  public static class WinApi {
    const int GWL_EXSTYLE = -20;
    const long WS_EX_TOPMOST = 0x00000008L;
    const long WS_EX_TRANSPARENT = 0x00000020L;
    const long WS_EX_TOOLWINDOW = 0x00000080L;
    const long WS_EX_LAYERED = 0x00080000L;
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOZORDER = 0x0004;
    const uint SWP_NOACTIVATE = 0x0010;
    const uint LWA_ALPHA = 0x00000002;

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int nIndex);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint crKey, byte alpha, uint flags);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint crKey, out byte alpha, out uint flags);

    static WinItem Describe(IntPtr h) {
      if (h == IntPtr.Zero || !IsWindow(h)) return null;
      uint pid = 0; GetWindowThreadProcessId(h, out pid);
      var sb = new StringBuilder(200); GetWindowText(h, sb, 200);
      string proc = "";
      try { using (var p = Process.GetProcessById((int)pid)) proc = p.ProcessName ?? ""; } catch {}
      long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
      byte alpha = 255; uint ck = 0, fl = 0;
      int opacity = 100;
      if ((ex & WS_EX_LAYERED) != 0 && GetLayeredWindowAttributes(h, out ck, out alpha, out fl) && (fl & LWA_ALPHA) != 0) {
        opacity = (int)Math.Round(alpha * 100.0 / 255.0);
      }
      return new WinItem {
        hwnd = h.ToInt64().ToString(),
        pid = pid,
        process = proc,
        title = sb.ToString(),
        topmost = (ex & WS_EX_TOPMOST) != 0,
        ghost = (ex & WS_EX_TRANSPARENT) != 0 && (ex & WS_EX_LAYERED) != 0,
        opacity = opacity
      };
    }

    public static WinItem Pin(long hwndNum, int on) {
      IntPtr h = new IntPtr(hwndNum);
      if (!IsWindow(h)) return null;
      IntPtr after = new IntPtr(on == 1 ? -1 : -2);
      SetWindowPos(h, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      return Describe(h);
    }

    public static WinItem SetOpacity(long hwndNum, int pct) {
      IntPtr h = new IntPtr(hwndNum);
      if (!IsWindow(h)) return null;
      int clamped = Math.Max(25, Math.Min(100, pct));
      long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
      SetWindowLongPtr(h, GWL_EXSTYLE, new IntPtr(ex | WS_EX_LAYERED));
      byte alpha = (byte)Math.Round(clamped * 255.0 / 100.0);
      SetLayeredWindowAttributes(h, 0, alpha, LWA_ALPHA);
      return Describe(h);
    }

    public static WinItem SetGhost(long hwndNum, int on) {
      IntPtr h = new IntPtr(hwndNum);
      if (!IsWindow(h)) return null;
      long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
      if (on == 1) {
        ex |= WS_EX_LAYERED | WS_EX_TRANSPARENT;
        SetWindowLongPtr(h, GWL_EXSTYLE, new IntPtr(ex));
        byte alpha = 255; uint ck = 0, fl = 0;
        if (!GetLayeredWindowAttributes(h, out ck, out alpha, out fl) || (fl & LWA_ALPHA) == 0) alpha = 200;
        SetLayeredWindowAttributes(h, 0, alpha, LWA_ALPHA);
      } else {
        ex &= ~WS_EX_TRANSPARENT;
        SetWindowLongPtr(h, GWL_EXSTYLE, new IntPtr(ex));
      }
      return Describe(h);
    }

    public static WinItem Snap(long hwndNum, string preset) {
      IntPtr h = new IntPtr(hwndNum);
      if (!IsWindow(h)) return null;
      if (preset == "max") { ShowWindow(h, 3); return Describe(h); }
      ShowWindow(h, 9);
      IntPtr mon = MonitorFromWindow(h, 2);
      if (mon == IntPtr.Zero) return Describe(h);
      MONITORINFO mi = new MONITORINFO(); mi.cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFO));
      if (!GetMonitorInfo(mon, ref mi)) return Describe(h);
      int wx = mi.rcWork.L, wy = mi.rcWork.T, ww = mi.rcWork.R - mi.rcWork.L, wh = mi.rcWork.B - mi.rcWork.T;
      int x = wx, y = wy, w = ww, hh = wh;
      if (preset == "left") { w = ww / 2; }
      else if (preset == "right") { x = wx + ww / 2; w = ww / 2; }
      else if (preset == "top") { hh = wh / 2; }
      else if (preset == "bottom") { y = wy + wh / 2; hh = wh / 2; }
      else if (preset == "left65") { w = (int)Math.Round(ww * 0.65); }
      else if (preset == "right35") { int lw = (int)Math.Round(ww * 0.65); x = wx + lw; w = ww - lw; }
      else if (preset == "center") { w = (int)Math.Round(ww * 0.80); hh = (int)Math.Round(wh * 0.84); x = wx + (ww - w) / 2; y = wy + (wh - hh) / 2; }
      SetWindowPos(h, IntPtr.Zero, x, y, w, hh, SWP_NOZORDER | SWP_NOACTIVATE);
      return Describe(h);
    }

    public static WinItem GetStatus(long hwndNum) { return Describe(new IntPtr(hwndNum)); }

    public static List<WinItem> ListWindows(uint skipPid) {
      var list = new List<WinItem>();
      EnumWindows((h, lp) => {
        if (!IsWindowVisible(h) || IsIconic(h)) return true;
        uint pid = 0; GetWindowThreadProcessId(h, out pid);
        if (pid == 0 || pid == skipPid) return true;
        var cls = new StringBuilder(64); GetClassName(h, cls, 64);
        string c = cls.ToString();
        if (c == "Shell_TrayWnd" || c == "Progman" || c == "WorkerW" || c == "Windows.UI.Core.CoreWindow") return true;
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        if ((ex & WS_EX_TOOLWINDOW) != 0 && (ex & WS_EX_TOPMOST) == 0) return true;
        var sb = new StringBuilder(200); GetWindowText(h, sb, 200);
        if (sb.Length == 0) return true;
        var item = Describe(h);
        if (item != null) list.Add(item);
        return list.Count < 24;
      }, IntPtr.Zero);
      return list;
    }
  }
}
'@

[long]$hVal = 0
[long]::TryParse($Hwnd, [ref]$hVal) | Out-Null

if ($Action -eq 'pin' -and $hVal -ne 0) {
  $item = [LumaDockWinTools.WinApi]::Pin($hVal, $(if ($Value -eq '1') { 1 } else { 0 }))
  Write-Output (@{ ok = ($null -ne $item); window = $item } | ConvertTo-Json -Depth 3 -Compress)
} elseif ($Action -eq 'opacity' -and $hVal -ne 0) {
  $pct = 100; [int]::TryParse($Value, [ref]$pct) | Out-Null
  $item = [LumaDockWinTools.WinApi]::SetOpacity($hVal, $pct)
  Write-Output (@{ ok = ($null -ne $item); window = $item } | ConvertTo-Json -Depth 3 -Compress)
} elseif ($Action -eq 'ghost' -and $hVal -ne 0) {
  $item = [LumaDockWinTools.WinApi]::SetGhost($hVal, $(if ($Value -eq '1') { 1 } else { 0 }))
  Write-Output (@{ ok = ($null -ne $item); window = $item } | ConvertTo-Json -Depth 3 -Compress)
} elseif ($Action -eq 'snap' -and $hVal -ne 0) {
  $item = [LumaDockWinTools.WinApi]::Snap($hVal, $Value)
  Write-Output (@{ ok = ($null -ne $item); window = $item } | ConvertTo-Json -Depth 3 -Compress)
} elseif ($Action -eq 'status' -and $hVal -ne 0) {
  $item = [LumaDockWinTools.WinApi]::GetStatus($hVal)
  Write-Output (@{ ok = ($null -ne $item); window = $item } | ConvertTo-Json -Depth 3 -Compress)
} else {
  $wins = [LumaDockWinTools.WinApi]::ListWindows([uint32]$SkipPid)
  Write-Output (@{ ok = $true; windows = $wins } | ConvertTo-Json -Depth 3 -Compress)
}
