# LumaDock Per-App Core Audio Session Mixer & Playback Endpoint Switcher
param(
  [string]$Action = 'list',
  [string]$Target = '',
  [string]$Value = ''
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace LumaDockAudioMixer {
  [StructLayout(LayoutKind.Sequential)]
  public struct PROPERTYKEY { public Guid fmtid; public uint pid; }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROPVARIANT {
    public ushort vt; public ushort r1, r2, r3;
    public IntPtr p; public IntPtr p2;
  }

  [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out uint count);
    int GetAt(uint index, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    int OpenPropertyStore(int access, out IPropertyStore props);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out uint state);
  }

  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    int GetCount(out uint count);
    int Item(uint index, out IMMDevice device);
  }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, uint stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}

  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string val, ref Guid ctx);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string val, ref Guid ctx);
    int GetGroupingParam(out Guid param);
    int SetGroupingParam(ref Guid param, ref Guid ctx);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetProcessId(out uint pid);
    int IsSystemSoundsSession();
    int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int f1(); int f2();
    int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid ctx);
    int GetMasterVolume(out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid ctx);
    int GetMute(out bool muted);
  }

  [Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPolicyConfig {
    int GetMixFormat(string id, IntPtr fmt);
    int GetDeviceFormat(string id, int def, IntPtr fmt);
    int ResetDeviceFormat(string id);
    int SetDeviceFormat(string id, IntPtr ep, IntPtr mix);
    int GetProcessingPeriod(string id, int def, IntPtr p1, IntPtr p2);
    int SetProcessingPeriod(string id, IntPtr p1);
    int GetShareMode(string id, IntPtr mode);
    int SetShareMode(string id, IntPtr mode);
    int GetPropertyValue(string id, ref PROPERTYKEY key, out PROPVARIANT pv);
    int SetPropertyValue(string id, ref PROPERTYKEY key, ref PROPVARIANT pv);
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    int SetEndpointVisibility(string id, [MarshalAs(UnmanagedType.Bool)] bool vis);
  }

  [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient {}

  public class SessionItem {
    public uint pid;
    public string process;
    public string name;
    public int volume;
    public bool muted;
    public int state;
  }

  public class DeviceItem {
    public string id;
    public string name;
    public bool active;
  }

  public static class Mixer {
    static Guid ctx = Guid.Empty;
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT p);

    static string FriendlyName(IMMDevice dev) {
      IPropertyStore ps = null;
      PROPVARIANT pv = new PROPVARIANT();
      try {
        dev.OpenPropertyStore(0, out ps);
        var key = new PROPERTYKEY { fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), pid = 14 };
        ps.GetValue(ref key, out pv);
        if (pv.vt == 31 && pv.p != IntPtr.Zero) return Marshal.PtrToStringUni(pv.p) ?? "";
        return "";
      } catch { return ""; }
      finally {
        try { PropVariantClear(ref pv); } catch {}
        if (ps != null) Marshal.ReleaseComObject(ps);
      }
    }

    public static List<DeviceItem> GetDevices(out string activeId) {
      activeId = "";
      var res = new List<DeviceItem>();
      IMMDeviceEnumerator en = null;
      IMMDevice def = null;
      IMMDeviceCollection col = null;
      try {
        en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        try {
          if (en.GetDefaultAudioEndpoint(0, 1, out def) == 0 && def != null) def.GetId(out activeId);
        } catch {}
        en.EnumAudioEndpoints(0, 1, out col);
        uint count = 0; col.GetCount(out count);
        for (uint i = 0; i < count; i++) {
          IMMDevice d = null;
          try {
            col.Item(i, out d);
            string id; d.GetId(out id);
            res.Add(new DeviceItem { id = id, name = FriendlyName(d), active = (id == activeId) });
          } finally { if (d != null) Marshal.ReleaseComObject(d); }
        }
      } finally {
        if (col != null) Marshal.ReleaseComObject(col);
        if (def != null) Marshal.ReleaseComObject(def);
        if (en != null) Marshal.ReleaseComObject(en);
      }
      return res;
    }

    public static void SetDefaultDevice(string id) {
      IPolicyConfig pc = null;
      try {
        pc = (IPolicyConfig)(new PolicyConfigClient());
        for (int role = 0; role < 3; role++) pc.SetDefaultEndpoint(id, role);
      } finally {
        if (pc != null) Marshal.ReleaseComObject(pc);
      }
    }

    public static List<SessionItem> GetSessions() {
      var byPid = new Dictionary<uint, SessionItem>();
      IMMDeviceEnumerator en = null;
      IMMDevice dev = null;
      IAudioSessionManager2 mgr = null;
      IAudioSessionEnumerator se = null;
      try {
        en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return new List<SessionItem>();
        object mgrObj; var iid = typeof(IAudioSessionManager2).GUID;
        dev.Activate(ref iid, 23, IntPtr.Zero, out mgrObj);
        mgr = (IAudioSessionManager2)mgrObj;
        mgr.GetSessionEnumerator(out se);
        int count = 0; se.GetCount(out count);
        for (int i = 0; i < count; i++) {
          IAudioSessionControl2 c = null;
          try {
            se.GetSession(i, out c);
            if (c == null) continue;
            uint pid = 0; c.GetProcessId(out pid);
            if (pid == 0 || c.IsSystemSoundsSession() == 0) continue;
            int st = 0; c.GetState(out st);
            if (st == 2) continue; // expired
            string dName = ""; try { c.GetDisplayName(out dName); } catch {}
            string proc = "";
            try { using (var p = Process.GetProcessById((int)pid)) proc = p.ProcessName ?? ""; } catch { continue; }
            if (string.IsNullOrEmpty(proc)) continue;
            var sav = c as ISimpleAudioVolume;
            float vol = 1f; bool muted = false;
            if (sav != null) { sav.GetMasterVolume(out vol); sav.GetMute(out muted); }
            string nice = (!string.IsNullOrEmpty(dName) && !dName.StartsWith("@")) ? dName : proc;
            SessionItem prev;
            if (!byPid.TryGetValue(pid, out prev) || st == 1) {
              byPid[pid] = new SessionItem { pid = pid, process = proc, name = nice, volume = (int)Math.Round(vol * 100), muted = muted, state = st };
            }
          } finally { if (c != null) Marshal.ReleaseComObject(c); }
        }
      } finally {
        if (se != null) Marshal.ReleaseComObject(se);
        if (mgr != null) Marshal.ReleaseComObject(mgr);
        if (dev != null) Marshal.ReleaseComObject(dev);
        if (en != null) Marshal.ReleaseComObject(en);
      }
      var list = new List<SessionItem>(byPid.Values);
      list.Sort((a, b) => b.state != a.state ? b.state.CompareTo(a.state) : string.Compare(a.name, b.name, StringComparison.OrdinalIgnoreCase));
      return list;
    }

    public static void ControlApp(uint targetPid, string procName, float volumePct, int muteState) {
      IMMDeviceEnumerator en = null;
      IMMDevice dev = null;
      IAudioSessionManager2 mgr = null;
      IAudioSessionEnumerator se = null;
      try {
        en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        en.GetDefaultAudioEndpoint(0, 1, out dev);
        object mgrObj; var iid = typeof(IAudioSessionManager2).GUID;
        dev.Activate(ref iid, 23, IntPtr.Zero, out mgrObj);
        mgr = (IAudioSessionManager2)mgrObj;
        mgr.GetSessionEnumerator(out se);
        int count = 0; se.GetCount(out count);
        for (int i = 0; i < count; i++) {
          IAudioSessionControl2 c = null;
          try {
            se.GetSession(i, out c);
            if (c == null) continue;
            uint pid = 0; c.GetProcessId(out pid);
            bool match = (targetPid > 0 && pid == targetPid);
            if (!match && !string.IsNullOrEmpty(procName) && pid > 0) {
              try { using (var p = Process.GetProcessById((int)pid)) match = string.Equals(p.ProcessName, procName, StringComparison.OrdinalIgnoreCase); } catch {}
            }
            if (!match) continue;
            var sav = c as ISimpleAudioVolume;
            if (sav != null) {
              if (volumePct >= 0f) sav.SetMasterVolume(Math.Max(0f, Math.Min(1f, volumePct / 100f)), ref ctx);
              if (muteState >= 0) sav.SetMute(muteState == 1, ref ctx);
            }
          } finally { if (c != null) Marshal.ReleaseComObject(c); }
        }
      } finally {
        if (se != null) Marshal.ReleaseComObject(se);
        if (mgr != null) Marshal.ReleaseComObject(mgr);
        if (dev != null) Marshal.ReleaseComObject(dev);
        if (en != null) Marshal.ReleaseComObject(en);
      }
    }
  }
}
'@

if ($Action -eq 'set-app') {
  $pidVal = [uint32]0
  $proc = ''
  if ([uint32]::TryParse($Target, [ref]$pidVal)) { } else { $proc = $Target }
  $v = -1.0
  [double]::TryParse($Value, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$v) | Out-Null
  [LumaDockAudioMixer.Mixer]::ControlApp($pidVal, $proc, [float]$v, -1)
} elseif ($Action -eq 'mute-app') {
  $pidVal = [uint32]0
  $proc = ''
  if ([uint32]::TryParse($Target, [ref]$pidVal)) { } else { $proc = $Target }
  $m = if ($Value -eq '1' -or $Value -eq 'true') { 1 } else { 0 }
  [LumaDockAudioMixer.Mixer]::ControlApp($pidVal, $proc, -1.0, $m)
} elseif ($Action -eq 'set-device' -and $Target) {
  [LumaDockAudioMixer.Mixer]::SetDefaultDevice($Target)
}

$activeId = ''
$devices = [LumaDockAudioMixer.Mixer]::GetDevices([ref]$activeId)
$sessions = [LumaDockAudioMixer.Mixer]::GetSessions()
Write-Output (@{ ok = $true; activeDeviceId = $activeId; devices = $devices; sessions = $sessions } | ConvertTo-Json -Depth 4 -Compress)
