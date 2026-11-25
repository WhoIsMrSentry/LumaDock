# Prints "<volume 0-100> <muted 0/1>" on volume change, "P <mic 0/1> <cam 0/1>" on privacy change,
# and "F <fullscreen 0/1>" when a third-party app enters/exits fullscreen.
param([int]$Parent = 0)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace LumaDock {
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float level, ref Guid context);
    int j();
    int GetMasterVolumeLevelScalar(out float level);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    int GetMute(out bool mute);
  }
  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    int GetPeakValue(out float peak);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid id, int context, int parameters, [MarshalAs(UnmanagedType.IUnknown)] out object iface); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

  public static class Audio {
    static Guid ctx = Guid.Empty;
    static object ActivateEndpoint(int flow, Guid iid) {
      IMMDeviceEnumerator enumerator = null;
      IMMDevice device = null;
      try {
        enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(flow, 1, out device));
        object iface;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, 0, out iface));
        return iface;
      } finally {
        if (device != null) Marshal.ReleaseComObject(device);
        if (enumerator != null) Marshal.ReleaseComObject(enumerator);
      }
    }
    static IAudioEndpointVolume Endpoint() {
      return (IAudioEndpointVolume)ActivateEndpoint(0, typeof(IAudioEndpointVolume).GUID);
    }
    public static void SetMicMute(bool mute) {
      IAudioEndpointVolume v = null;
      try {
        v = (IAudioEndpointVolume)ActivateEndpoint(1, typeof(IAudioEndpointVolume).GUID);
        Marshal.ThrowExceptionForHR(v.SetMute(mute, ref ctx));
      } catch {} finally {
        if (v != null) Marshal.ReleaseComObject(v);
      }
    }
    public static string Read() {
      IAudioEndpointVolume v = null;
      try {
        v = Endpoint(); float level; bool mute;
        Marshal.ThrowExceptionForHR(v.GetMasterVolumeLevelScalar(out level));
        Marshal.ThrowExceptionForHR(v.GetMute(out mute));
        return ((int)Math.Round(level * 100)).ToString() + " " + (mute ? "1" : "0");
      } finally {
        if (v != null) Marshal.ReleaseComObject(v);
      }
    }
    public static int ReadPeak() {
      IAudioMeterInformation m = null;
      try {
        m = (IAudioMeterInformation)ActivateEndpoint(0, typeof(IAudioMeterInformation).GUID);
        float peak;
        Marshal.ThrowExceptionForHR(m.GetPeakValue(out peak));
        return Math.Max(0, Math.Min(100, (int)Math.Round(peak * 100)));
      } catch {
        return -1;
      } finally {
        if (m != null) Marshal.ReleaseComObject(m);
      }
    }
    public static void Set(float pct) {
      IAudioEndpointVolume v = null;
      try {
        v = Endpoint();
        float clamped = Math.Max(0f, Math.Min(1f, pct / 100f));
        Marshal.ThrowExceptionForHR(v.SetMasterVolumeLevelScalar(clamped, ref ctx));
        if (clamped > 0f) { v.SetMute(false, ref ctx); }
      } finally {
        if (v != null) Marshal.ReleaseComObject(v);
      }
    }
    public static void Step(float deltaPct) {
      IAudioEndpointVolume v = null;
      try {
        v = Endpoint(); float level;
        Marshal.ThrowExceptionForHR(v.GetMasterVolumeLevelScalar(out level));
        float next = Math.Max(0f, Math.Min(1f, level + deltaPct / 100f));
        Marshal.ThrowExceptionForHR(v.SetMasterVolumeLevelScalar(next, ref ctx));
        if (deltaPct > 0f) { v.SetMute(false, ref ctx); }
      } finally {
        if (v != null) Marshal.ReleaseComObject(v);
      }
    }
    public static void ToggleMute() {
      IAudioEndpointVolume v = null;
      try {
        v = Endpoint(); bool mute;
        Marshal.ThrowExceptionForHR(v.GetMute(out mute));
        Marshal.ThrowExceptionForHR(v.SetMute(!mute, ref ctx));
      } finally {
        if (v != null) Marshal.ReleaseComObject(v);
      }
    }

    public static string ReadNetBytes() {
      long rx = 0, tx = 0;
      try {
        foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()) {
          if (ni.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up &&
              ni.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback) {
            var st = ni.GetIPStatistics();
            rx += st.BytesReceived;
            tx += st.BytesSent;
          }
        }
      } catch {}
      return "N " + rx.ToString() + " " + tx.ToString();
    }

    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);

    static string ProcName(uint pid) {
      if (pid == 0) return "";
      try { using (var p = System.Diagnostics.Process.GetProcessById((int)pid)) return p.ProcessName ?? ""; }
      catch { return ""; }
    }

    public static string ClipboardSeqAndOwner() {
      uint seq = GetClipboardSequenceNumber();
      string owner = "";
      try {
        IntPtr h = GetClipboardOwner();
        if (h != IntPtr.Zero) {
          uint pid = 0; GetWindowThreadProcessId(h, out pid);
          owner = ProcName(pid);
        }
      } catch {}
      return "C " + seq.ToString() + "|" + owner;
    }

    public static string ForegroundWindowInfo(uint skipPid) {
      IntPtr fg = GetForegroundWindow();
      if (fg == IntPtr.Zero || IsIconic(fg)) return "";
      uint pid = 0; GetWindowThreadProcessId(fg, out pid);
      if (pid == 0 || pid == skipPid) return "";
      var cls = new StringBuilder(64);
      GetClassName(fg, cls, 64);
      string c = cls.ToString();
      if (c == "Shell_TrayWnd" || c == "Progman" || c == "WorkerW" || c == "Windows.UI.Core.CoreWindow") return "";
      var titleSb = new StringBuilder(220);
      GetWindowText(fg, titleSb, 220);
      string proc = ProcName(pid).Replace('|', ' ');
      string title = titleSb.ToString().Replace('|', ' ').Replace('\r', ' ').Replace('\n', ' ');
      return "W " + fg.ToInt64().ToString() + "|" + pid.ToString() + "|" + proc + "|" + title;
    }

    public static int IsFullscreen(uint skipPid) {
      IntPtr fg = GetForegroundWindow();
      if (fg == IntPtr.Zero || IsIconic(fg)) return 0;
      uint pid = 0; GetWindowThreadProcessId(fg, out pid);
      if (pid == 0 || pid == skipPid) return 0;
      string proc = ProcName(pid).ToLowerInvariant();
      if (proc == "screenclippinghost" || proc == "snippingtool" || proc == "shellexperiencehost" ||
          proc == "searchhost" || proc == "startmenuexperiencehost" || proc == "lockapp" ||
          proc == "textinputhost" || proc == "crossdeviceresume" || proc == "pickerhost" ||
          proc == "dwm") return 0;
      var cls = new StringBuilder(128);
      GetClassName(fg, cls, 128);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Windows.UI.Core.CoreWindow") return 0;
      RECT wr;
      if (!GetWindowRect(fg, out wr)) return 0;
      IntPtr mon = MonitorFromWindow(fg, 2);
      if (mon == IntPtr.Zero) return 0;
      MONITORINFO mi = new MONITORINFO(); mi.cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFO));
      if (!GetMonitorInfo(mon, ref mi)) return 0;
      bool covers = wr.L <= mi.rcMonitor.L && wr.T <= mi.rcMonitor.T && wr.R >= mi.rcMonitor.R && wr.B >= mi.rcMonitor.B;
      return covers ? 1 : 0;
    }
  }
}
'@

function Get-PrivacyActive([string]$cap) {
  $base = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$cap"
  if (-not (Test-Path $base)) { return 0 }
  try {
    foreach ($item in Get-ChildItem -Path $base -ErrorAction SilentlyContinue) {
      $stop = (Get-ItemProperty -Path $item.PSPath -Name 'LastUsedTimeStop' -ErrorAction SilentlyContinue).LastUsedTimeStop
      if ($null -ne $stop -and [long]$stop -eq 0) { return 1 }
      if ($item.PSChildName -eq 'NonPackaged') {
        foreach ($sub in Get-ChildItem -Path $item.PSPath -ErrorAction SilentlyContinue) {
          $subStop = (Get-ItemProperty -Path $sub.PSPath -Name 'LastUsedTimeStop' -ErrorAction SilentlyContinue).LastUsedTimeStop
          if ($null -ne $subStop -and [long]$subStop -eq 0) { return 1 }
        }
      }
    }
  } catch {}
  return 0
}

$cmdFile = "$env:TEMP\lumadock-vol-cmd.txt"
$last = ''
$lastPrivacy = ''
$lastFs = ''
$lastClip = ''
$lastWin = ''
$lastPeak = -1
$tick = 0

while ($true) {
  $tick++
  # Stop together with LumaDock, also when closed abruptly.
  if ($Parent -and ($tick % 20 -eq 0) -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { exit 0 }

  if (Test-Path $cmdFile) {
    try {
      $raw = Get-Content $cmdFile -Raw -ErrorAction SilentlyContinue
      Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue
      if ($raw) {
        foreach ($line in ($raw -split "[\r\n]+")) {
          $parts = $line.Trim() -split '\s+'
          if ($parts[0] -eq 'set' -and $parts.Length -ge 2) {
            $v = 0.0; if ([double]::TryParse($parts[1], [System.Globalization.CultureInfo]::InvariantCulture, [ref]$v)) { [LumaDock.Audio]::Set([float]$v) }
          } elseif ($parts[0] -eq 'step' -and $parts.Length -ge 2) {
            $d = 0.0; if ([double]::TryParse($parts[1], [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { [LumaDock.Audio]::Step([float]$d) }
          } elseif ($parts[0] -eq 'mute') {
            [LumaDock.Audio]::ToggleMute()
          } elseif ($parts[0] -eq 'mic-mute' -and $parts.Length -ge 2) {
            [LumaDock.Audio]::SetMicMute($parts[1] -eq '1')
          }
        }
      }
    } catch {}
  }

  try { $now = [LumaDock.Audio]::Read() } catch { $now = $last }
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }

  try {
    $pk = [LumaDock.Audio]::ReadPeak()
    if ($pk -ge 0 -and ($pk -ne $lastPeak)) {
      if ($pk -eq 0 -or $lastPeak -lt 0 -or [Math]::Abs($pk - $lastPeak) -ge 2) {
        [Console]::Out.WriteLine("A $pk")
        [Console]::Out.Flush()
        $lastPeak = $pk
      }
    }
  } catch {}

  if ($tick % 3 -eq 0) {
    try {
      $cNow = [LumaDock.Audio]::ClipboardSeqAndOwner()
      if ($cNow -ne $lastClip) { [Console]::Out.WriteLine($cNow); [Console]::Out.Flush(); $lastClip = $cNow }
    } catch {}
    try {
      $wNow = [LumaDock.Audio]::ForegroundWindowInfo([uint32]$Parent)
      if ($wNow -and $wNow -ne $lastWin) { [Console]::Out.WriteLine($wNow); [Console]::Out.Flush(); $lastWin = $wNow }
    } catch {}
  }

  if ($tick % 7 -eq 0) {
    try {
      $mic = Get-PrivacyActive 'microphone'
      $cam = Get-PrivacyActive 'webcam'
      $pNow = "P $mic $cam"
      if ($pNow -ne $lastPrivacy) { [Console]::Out.WriteLine($pNow); [Console]::Out.Flush(); $lastPrivacy = $pNow }
    } catch {}
    try {
      $fs = [LumaDock.Audio]::IsFullscreen([uint32]$Parent)
      $fNow = "F $fs"
      if ($fNow -ne $lastFs) { [Console]::Out.WriteLine($fNow); [Console]::Out.Flush(); $lastFs = $fNow }
    } catch {}
  }

  if ($tick % 10 -eq 0) {
    try {
      $nNow = [LumaDock.Audio]::ReadNetBytes()
      [Console]::Out.WriteLine($nNow)
      [Console]::Out.Flush()
    } catch {}
  }

  Start-Sleep -Milliseconds 150
}
