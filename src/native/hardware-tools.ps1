# LumaDock Hardware & OS Utilities: Display Brightness (WMI + DDC/CI), File Locksmith (Restart Manager), Top Processes
param(
  [string]$Action = 'top-procs',
  [string]$Target = '',
  [string]$Value = ''
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace LumaDockHw {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string szPhysicalMonitorDescription;
  }

  public class DdcItem {
    public int index;
    public string name;
    public int value;
    public int min;
    public int max;
  }

  public static class Display {
    delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
    [DllImport("dxva2.dll", SetLastError = true)] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint pdwNumberOfPhysicalMonitors);
    [DllImport("dxva2.dll", SetLastError = true)] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);
    [DllImport("dxva2.dll", SetLastError = true)] static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint pdwMinimumBrightness, out uint pdwCurrentBrightness, out uint pdwMaximumBrightness);
    [DllImport("dxva2.dll", SetLastError = true)] static extern bool SetMonitorBrightness(IntPtr hMonitor, uint dwNewBrightness);
    [DllImport("dxva2.dll", SetLastError = true)] static extern bool DestroyPhysicalMonitors(uint dwPhysicalMonitorArraySize, [In] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

    public static List<DdcItem> ListDdc() {
      var res = new List<DdcItem>();
      int idx = 0;
      EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT r, IntPtr d) => {
        uint count = 0;
        if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out count) && count > 0) {
          var arr = new PHYSICAL_MONITOR[count];
          if (GetPhysicalMonitorsFromHMONITOR(hMon, count, arr)) {
            for (int i = 0; i < count; i++) {
              uint minB = 0, curB = 0, maxB = 100;
              if (GetMonitorBrightness(arr[i].hPhysicalMonitor, out minB, out curB, out maxB) && maxB > minB) {
                int pct = (int)Math.Round((curB - minB) * 100.0 / (maxB - minB));
                res.Add(new DdcItem { index = idx, name = arr[i].szPhysicalMonitorDescription ?? ("Monitor " + (idx + 1)), value = pct, min = (int)minB, max = (int)maxB });
              }
              idx++;
            }
            DestroyPhysicalMonitors(count, arr);
          }
        }
        return true;
      }, IntPtr.Zero);
      return res;
    }

    public static bool SetDdc(int targetIndex, int pct) {
      bool any = false;
      int idx = 0;
      int clamped = Math.Max(0, Math.Min(100, pct));
      EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT r, IntPtr d) => {
        uint count = 0;
        if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out count) && count > 0) {
          var arr = new PHYSICAL_MONITOR[count];
          if (GetPhysicalMonitorsFromHMONITOR(hMon, count, arr)) {
            for (int i = 0; i < count; i++) {
              if (targetIndex < 0 || idx == targetIndex) {
                uint minB = 0, curB = 0, maxB = 100;
                if (GetMonitorBrightness(arr[i].hPhysicalMonitor, out minB, out curB, out maxB) && maxB > minB) {
                  uint raw = (uint)Math.Round(minB + (clamped / 100.0) * (maxB - minB));
                  if (SetMonitorBrightness(arr[i].hPhysicalMonitor, raw)) any = true;
                }
              }
              idx++;
            }
            DestroyPhysicalMonitors(count, arr);
          }
        }
        return true;
      }, IntPtr.Zero);
      return any;
    }
  }

  public static class Locksmith {
    [StructLayout(LayoutKind.Sequential)] public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct RM_PROCESS_INFO {
      public RM_UNIQUE_PROCESS Process;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
      public int ApplicationType;
      public uint AppStatus;
      public uint TSSessionId;
      [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
    }
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
    [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint pSessionHandle);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, [In] RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
    [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

    public class LockItem { public int pid; public string name; public string service; }

    public static List<LockItem> FindLocks(string[] paths) {
      var result = new List<LockItem>();
      if (paths == null || paths.Length == 0) return result;
      uint handle = 0;
      if (RmStartSession(out handle, 0, Guid.NewGuid().ToString("N")) != 0) return result;
      try {
        if (RmRegisterResources(handle, (uint)paths.Length, paths, 0, null, 0, null) != 0) return result;
        uint needed = 0, count = 0, reason = 0;
        int rc = RmGetList(handle, out needed, ref count, null, ref reason);
        if (rc == 234 && needed > 0) {
          var arr = new RM_PROCESS_INFO[needed];
          count = needed;
          if (RmGetList(handle, out needed, ref count, arr, ref reason) == 0) {
            var seen = new HashSet<int>();
            for (int i = 0; i < count; i++) {
              int pid = arr[i].Process.dwProcessId;
              if (seen.Add(pid)) {
                result.Add(new LockItem { pid = pid, name = arr[i].strAppName ?? ("PID " + pid), service = arr[i].strServiceShortName ?? "" });
              }
            }
          }
        }
      } finally {
        RmEndSession(handle);
      }
      return result;
    }
  }
}
'@

if ($Action -eq 'brightness-list') {
  $list = @()
  try {
    $wmi = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue
    $wmiIdx = 0
    foreach ($m in $wmi) {
      $list += @{ id = "wmi:$wmiIdx"; name = "Internal Display"; kind = "wmi"; value = [int]$m.CurrentBrightness; min = 0; max = 100 }
      $wmiIdx++
    }
  } catch {}
  try {
    $ddc = [LumaDockHw.Display]::ListDdc()
    foreach ($d in $ddc) {
      $list += @{ id = "ddc:$($d.index)"; name = $d.name; kind = "ddcci"; value = [int]$d.value; min = 0; max = 100 }
    }
  } catch {}
  Write-Output (@{ ok = $true; monitors = $list } | ConvertTo-Json -Depth 3 -Compress)
} elseif ($Action -eq 'brightness-set') {
  $pct = 70; [int]::TryParse($Value, [ref]$pct) | Out-Null
  $pct = [Math]::Max(0, [Math]::Min(100, $pct))
  $did = $false
  if (-not $Target -or $Target -eq 'all' -or $Target.StartsWith('wmi:')) {
    try {
      $methods = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue
      foreach ($m in $methods) {
        $null = $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$pct } -ErrorAction SilentlyContinue
        $did = $true
      }
    } catch {}
  }
  if (-not $Target -or $Target -eq 'all' -or $Target.StartsWith('ddc:')) {
    $ddcIdx = -1
    if ($Target.StartsWith('ddc:')) { [int]::TryParse($Target.Substring(4), [ref]$ddcIdx) | Out-Null }
    try {
      if ([LumaDockHw.Display]::SetDdc($ddcIdx, $pct)) { $did = $true }
    } catch {}
  }
  Write-Output (@{ ok = $true; applied = $did; value = $pct } | ConvertTo-Json -Depth 2 -Compress)
} elseif ($Action -eq 'file-locks') {
  $targets = @()
  if ($Target -and (Test-Path -LiteralPath $Target)) {
    $item = Get-Item -LiteralPath $Target -ErrorAction SilentlyContinue
    if ($item -and $item.PSIsContainer) {
      $targets = @(Get-ChildItem -LiteralPath $Target -File -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 40 -ExpandProperty FullName)
    } else {
      $targets = @($Target)
    }
  }
  $locks = [LumaDockHw.Locksmith]::FindLocks([string[]]$targets)
  Write-Output (@{ ok = $true; target = $Target; locks = $locks } | ConvertTo-Json -Depth 3 -Compress)
} else {
  $procs = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | ForEach-Object {
    @{
      pid = $_.Id
      name = $_.ProcessName
      memMb = [int][Math]::Round($_.WorkingSet64 / 1MB)
      cpuSec = [Math]::Round($_.CPU, 1)
      title = if ($_.MainWindowTitle) { $_.MainWindowTitle.Substring(0, [Math]::Min(50, $_.MainWindowTitle.Length)) } else { '' }
    }
  }
  Write-Output (@{ ok = $true; processes = @($procs) } | ConvertTo-Json -Depth 3 -Compress)
}
