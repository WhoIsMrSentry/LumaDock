<p align="center"><img src="assets/icon-256.png" width="120" alt="Robo"></p>

<h1 align="center">LumaDock</h1>
<p align="center"><b>A Dynamic Island for Windows with native AI monitoring and desktop companion.</b><br>
Robo monitors Claude Code, ChatGPT, Claude, and Codex, requests one-click permissions, and alerts you when tasks finish.</p>

<p align="center">
  <b>🧪 Public Beta</b> · Windows 10 & 11 · macOS (Apple Silicon & Intel) · Free & Open Source<br>
  <a href="README.tr.md">🇹🇷 Türkçe Dokümantasyon</a>
</p>

---

## Overview

LumaDock brings a responsive, fluid **Dynamic Island** experience to Windows 10 and 11. Powered by native Windows UI Automation and local hooks, LumaDock lets you supervise your local AI coding agents and LLM sessions without stealing focus or requiring complex API configurations.

### Key Highlights

| Feature | Description |
| --- | --- |
| **Live AI Monitoring** | Tracks Claude Code and Codex execution in real time: active file reads, edits, and terminal commands. Island glows with custom status colors (busy, done, error). |
| **Zero-Config Web AI Tracking** | Uses native Windows UI Automation to observe ChatGPT and Claude web/desktop tabs. Traffic-light indicator shows generation state and questions. |
| **One-Click Approvals** | Directly approve or deny sensitive CLI tool actions (e.g. `npm install`, shell executions) straight from the island. |
| **Robo Buddy & Fix-It** | Drag Robo over any window or error message. Robo captures screen context, analyzes issues with your connected AI, and types verified fixes with permission. |
| **Rate Limit Ring** | Visual ring display for Anthropic Claude 5-hour quota and session usage. |
| **Integrated Productivity Apps** | Spotify playback controller with device switcher, Pomodoro focus timer, clipboard history manager, and quick notepad. |
| **Dedicated Settings App** | Standalone settings suite with live mascot preview, light/dark themes, custom sound packs, and outfit customization. |

---

## Quick Start (Pre-built)

### Windows
1. Download **`LumaDock-Setup-1.3.0-beta.1-x64.exe`** (installer) or **`LumaDock-1.3.0-beta.1-win-x64.zip`** (portable) from [Releases](../../releases/latest).
2. Run the installer or extract the archive and launch **`LumaDock.exe`**.
3. *(If SmartScreen appears, click **More info → Run anyway**).*

### macOS
1. Download **`LumaDock-1.3.0-beta.1-mac-arm64.dmg`** (Apple Silicon) or **`LumaDock-1.3.0-beta.1-mac-x64.dmg`** (Intel) from [Releases](../../releases/latest).
2. Drag **`LumaDock`** into **Applications**.
3. *(Since builds are unsigned, on first launch right-click **LumaDock → Open** or allow it in **System Settings → Privacy & Security**).*

### Shortcuts & Control

* **`Ctrl + Alt + T`**: Toggle Dynamic Island expand / collapse.
* **`Ctrl + Alt + 1..6`**: Direct shortcut to mini-apps (Music, Focus, Clipboard, Notes, etc.).
* **System Tray**: Right-click Robo in the taskbar tray for autostart settings and quick access.
* **`CHECK-WINDOWS.cmd`**: Validates native Windows UI Automation accessibility status for active AI windows.

---

## Development & Building

### Prerequisites

* [Node.js](https://nodejs.org) (v18+ recommended)
* Windows 10 or 11 with PowerShell 5.1+

### Local Setup

```powershell
# Clone the repository
git clone https://github.com/WhoIsMrSentry/LumaDock.git
cd LumaDock

# Install dependencies
npm ci

# Run test suite (26 native and mock integration tests)
npm test

# Launch LumaDock in development mode
npm start
```

### Optional Codex Integration

For optional OpenAI Codex capabilities:
```powershell
npm install @openai/codex --include=optional
```

### Running Verification Tests

```powershell
npm test
```

To test the Windows UI Automation accessibility bridge directly:
```powershell
npm run check:windows
```

---

## Privacy First

LumaDock operates entirely on your local machine:
* No external telemetry or cloud tracking account required.
* Claude Code and terminal agent monitoring operates purely over local loopback IPC/HTTP hooks.
* Browser chat monitoring reads locally via Microsoft Windows UI Automation (`System.Windows.Automation`) without passing browser credentials or session cookies.

---

## License

MIT License. Developed and maintained by [SentryCoderDev](https://github.com/WhoIsMrSentry).
