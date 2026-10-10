<p align="center">
  <img src="images/icons/icon-128.png" width="96" alt="YouChords logo">
</p>

<h1 align="center">YouChords Local</h1>

<p align="center">
  A local-first Chrome extension that adds synchronized chords, lyrics, word-level transcription, audio tools, and guitar practice controls to YouTube.
</p>

# `yt-dlp` updates

The local processor checks PyPI for a newer `yt-dlp` version once a day while it is running. The extension marks its icon when an update is available and shows an approval button in the popup. The update is installed only after you choose that button. An update waits until current processing jobs finish; it does not rebuild the Docker image or replace the Windows installation.

---

## What it does

YouChords turns a YouTube music video into a practice workspace without sending its processing jobs to a hosted backend:

- Detects and displays synchronized chord diagrams.
- Shows subtitles and chords together in a focused practice panel.
- Creates local WhisperX transcripts with sentence and word timestamps.
- Lets you choose **Whisper large-v2** or **Whisper large-v3** in **Chords → Subtitles In Chords**.
- Uses an NVIDIA GPU for WhisperX and audio separation when available; otherwise it automatically uses the CPU.
- Stores chord and transcription results locally, so returning to the same video/model/language can reuse the cache.
- Adds audio separation, tuner, chord explorer, transposition, capo, pitch/speed controls, and jam-session tools.

## See it in action

<table>
  <tr>
    <td width="50%"><img src="Docs/assets/readme/youchords-buttons-overview.webp" width="100%" alt="YouChords tool overview"></td>
    <td width="50%"><img src="Docs/assets/readme/youchords-buttons.webp" width="100%" alt="YouChords controls on a YouTube video"></td>
  </tr>
  <tr>
    <td align="center"><strong>Music tools in the player</strong></td>
    <td align="center"><strong>Controls beside YouTube playback</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="Docs/assets/readme/youchords-subtitles.webp" width="100%" alt="Synchronized subtitles in YouChords"></td>
    <td width="50%"><img src="Docs/assets/readme/youchords-panel.webp" width="100%" alt="Subtitles and chords panel"></td>
  </tr>
  <tr>
    <td align="center"><strong>Synced subtitles</strong></td>
    <td align="center"><strong>Subtitles and chords panel</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="Docs/assets/readme/youchords-carousel.webp" width="100%" alt="Chord carousel"></td>
    <td width="50%"><img src="Docs/assets/readme/youchords-chord-explorer.webp" width="100%" alt="Chord explorer"></td>
  </tr>
  <tr>
    <td align="center"><strong>Follow chord changes in time</strong></td>
    <td align="center"><strong>Explore chord shapes</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="Docs/assets/readme/youchords-tuner.webp" width="100%" alt="Built-in guitar tuner"></td>
    <td width="50%"><img src="Docs/assets/readme/youchords-settings.webp" width="100%" alt="YouChords settings"></td>
  </tr>
  <tr>
    <td align="center"><strong>Built-in tuner</strong></td>
    <td align="center"><strong>Personalized settings</strong></td>
  </tr>
  <tr>
    <td width="50%"><img src="Docs/assets/readme/youchords-profile.webp" width="100%" alt="YouChords user profile"></td>
    <td width="50%"><img src="Docs/assets/readme/youchords-popup-sign-in.webp" width="100%" alt="YouChords extension popup"></td>
  </tr>
  <tr>
    <td align="center"><strong>Profile and preferences</strong></td>
    <td align="center"><strong>Extension popup</strong></td>
  </tr>
</table>

## Installation

Choose a processor. Docker, Windows, and Linux can be installed at once and use separate local addresses.

- Google Chrome or another Chromium browser.
- An NVIDIA GPU and current driver speed up transcription and audio separation. A CPU-only mode is selected automatically when CUDA is unavailable; processing may be slower.
- A reliable internet connection for the first installation and model downloads.

### Windows installer

Download and run [YouChords-Local-Windows-Setup.exe](https://github.com/yuval-kahan/youchords-local/releases/latest/download/YouChords-Local-Windows-Setup.exe). During setup, choose whether it should start automatically when you sign in; this option is checked by default on a new installation. The Start menu shortcut remains available for manual launches. The processor uses port `8766`. The first setup downloads a private Python runtime and the AI packages, so allow time and several gigabytes of free disk space.

In the extension popup, choose **Windows · port 8766** under **PROCESSOR**.

#### Stop, start, or disable automatic startup

To stop the processor, open PowerShell and run:

```powershell
$python = Join-Path $env:LOCALAPPDATA 'Programs\YouChords Local\venv\Scripts\python.exe'
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -eq $python -and $_.CommandLine -like '*local_companion.py*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId }
```

To start it again, open **Start YouChords Windows Processor** from the Start menu. To change the automatic startup choice later, run the installer again and select or clear **Start the processor automatically when I sign in**. You can also press **Win+R**, enter `shell:startup`, and delete the **YouChords Local Windows** shortcut to disable automatic startup.

### Docker processor

Install Docker Desktop with its WSL 2 backend. The start script detects NVIDIA GPU support and chooses GPU or CPU mode:

```powershell
.\scripts\start_youchords_local.ps1
```

On Linux with Docker installed, run:

```bash
./scripts/start_youchords_local.sh
```

Check that it is ready:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/v1/health
```

The Docker processor keeps using port `8765`. In the extension popup, choose **Docker · port 8765** under **PROCESSOR**. If Docker cannot access a detected NVIDIA GPU, the start script retries in CPU mode. The initial Docker build downloads dependencies and may take a while.

### Linux setup

The first native Linux package is built and smoke-tested on 64-bit Ubuntu 24.04. Download `youchords-local_*_amd64.deb` from the [latest release](https://github.com/yuval-kahan/youchords-local/releases/latest), then install it and run the setup command from a terminal:

```bash
sudo apt install ./youchords-local_*_amd64.deb
youchords-local-setup
```

The setup installs a private Python runtime, detects NVIDIA CUDA support, and installs the matching AI packages. It asks whether to start the per-user service automatically at sign-in; without a usable NVIDIA driver it installs the CPU runtime. The processor uses port `8767`. In the extension popup choose **Linux · port 8767**. Models download on first use, so allow several gigabytes of disk space. For a non-interactive setup, pass `--auto-start` or `--manual` to choose explicitly; `--manual` leaves the service installed but disabled at sign-in.

#### Stop, start, or disable automatic startup

Run these commands in a terminal as your regular user; `sudo` is not needed:

```bash
# Stop it now. It will start again at your next sign-in.
systemctl --user stop youchords-local.service

# Start it again now.
systemctl --user start youchords-local.service

# Stop it now and keep it from starting at sign-in.
systemctl --user disable --now youchords-local.service

# Start it now and restore automatic startup at sign-in.
systemctl --user enable --now youchords-local.service

# Check whether it is running.
systemctl --user status youchords-local.service
```

If you chose manual startup, start the processor when needed with `systemctl --user start youchords-local.service`. Use the enable/disable commands above to change automatic startup later.

### Load the extension in Chrome

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository folder containing `manifest.json`.

Open a YouTube music video and use the YouChords buttons next to the player controls.

If multiple processors are running, the popup's **PROCESSOR** selector decides which one handles new work. Results and caches stay separate for each installation.

## Install with Codex or another AI coding assistant

Codex can help install Docker, Windows, or Linux and guide you through loading the extension. The first setup downloads dependencies and may take a while. The extension must still be loaded in Chrome from the repository folder containing `manifest.json`.

If the repository is not already open in Codex, ask it to clone `https://github.com/yuval-kahan/youchords-local` into your workspace. Then paste this prompt:

```text
Set up YouChords Local from this repository for local use on this computer.

Read the README and inspect the relevant installer or setup script before running it. Ask whether I want Windows, Docker, or Linux, and let me choose automatic startup or manual launch for Windows and Linux. For Docker, check that Docker is available, run the operating-system-specific start script, then check http://127.0.0.1:8765/v1/health. For Windows, download and run the latest EXE and check http://127.0.0.1:8766/v1/health. For Linux, install the latest amd64 .deb package and run youchords-local-setup with --auto-start or --manual to apply my choice, then check http://127.0.0.1:8767/v1/health. Report whether the selected processor is ready, which accelerator it uses, and any missing prerequisite.

After the processor is ready, guide me to chrome://extensions, enable Developer mode, choose Load unpacked, and select this repository's root folder containing manifest.json. If you cannot control Chrome, give me those steps clearly.

Keep Gemini features disabled unless I ask to enable them. Never ask me to paste API keys or passwords into chat, and do not put secrets in files. This is a local installation only: do not commit, push, deploy, or publish anything.
```

The Codex prompt does not replace the Chrome step: Chrome needs the unpacked extension folder selected in `chrome://extensions`.

## Whisper subtitles: v2 or v3

Open **Chords → Settings → Subtitles In Chords → Whisper Model** and select one of these options:

| Model | Best use | Notes |
| --- | --- | --- |
| `large-v2` | Default, excellent quality | The current default and a very strong balance of speed and accuracy. |
| `large-v3` | Maximum transcription quality | Usually more accurate, particularly on difficult audio; its first use may download the model and can take longer. |

Both choices use the same local **WhisperX** workflow. WhisperX creates word-level timing through forced alignment, so a sentence can be highlighted while the active word is highlighted inside it. The selected model, language, and transcript are tracked independently: selecting another model intentionally creates a fresh transcript instead of silently reusing the one from the other model.

## Local processing and cache

The selected local companion service handles expensive tasks in a FIFO queue, so Whisper, chord extraction, and audio separation do not compete for compute on long videos. Docker uses `http://127.0.0.1:8765`, Windows uses `http://127.0.0.1:8766`, and Linux uses `http://127.0.0.1:8767`.

- **Docker models and results** stay in `.youchords-local` beside the repository.
- **Windows models and results** stay under `%LOCALAPPDATA%\YouChordsLocal`.
- **Linux models and results** stay under `~/.local/share/YouChordsLocal`.
- **Finished transcripts** are cached by video ID, Whisper model, and requested language in the selected processor's data folder.
- **Browser-side subtitle and chord data** is saved in IndexedDB, so reopening the same video normally reuses the result.
- If you switch from `large-v2` to `large-v3` (or change the language), a new transcript is expected and correct.

## Troubleshooting

### The local extension says the processor is unavailable

Check that the popup's **PROCESSOR** choice matches the installed processor.

For Docker:

```powershell
docker compose -f docker-compose.local.yml ps
docker compose -f docker-compose.local.yml logs -f youchords-local
```

For Windows, open **Start YouChords Windows Processor** from the Start menu and check `http://127.0.0.1:8766/v1/health` again.

### Docker Desktop cannot start the container on Windows

If restarting Docker Desktop does not bring the YouChords container back, restart the Windows NAT driver (WinNAT). Quit Docker Desktop completely first. Stopping WinNAT temporarily interrupts NAT networking used by containers; [Microsoft's WinNAT guide](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/setup-nat-network) describes how Windows container networking uses HNS and WinNAT.

**Stop WinNAT:** Save this as `Stop-WinNAT.bat` and run it. Approve the administrator prompt.

```bat
@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Stopping WinNAT...
net stop winnat
echo.
echo Done.
timeout /t 2 /nobreak >nul
exit
```

**Start WinNAT again:** After the stop command finishes, save this as `Start-WinNAT.bat` and run it. This restores the service.

```bat
@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Starting WinNAT...
net start winnat
echo.
echo Done.
timeout /t 2 /nobreak >nul
exit
```

Check the `net stop` and `net start` output; the scripts print `Done` even if a command reports an error. Then reopen Docker Desktop and start YouChords again:

```powershell
.\scripts\start_youchords_local.ps1
Invoke-RestMethod http://127.0.0.1:8765/v1/health
```

### Downloads or long-video processing fail

Open the extension popup and approve any pending `yt-dlp` update. If a job is already running, wait for it to finish and approve again. For long videos, leave the page open while the local queue finishes its earlier jobs.

### The processor is using CPU mode

The processor uses CPU automatically when CUDA is unavailable. Check `/v1/health` and its `accelerator` object. If you expected GPU acceleration, install or update the NVIDIA driver and confirm that `nvidia-smi` works, then restart the selected processor.

For Docker:

```powershell
docker compose -f docker-compose.local.yml down
./scripts/start_youchords_local.sh
```

## Security

This repository must never contain API keys, passwords, private keys, browser tokens, or local `.env` files. Keep credentials in local ignored configuration only, rotate anything that was ever exposed, and review `git status` before committing.

## Development notes

- The local companion source is in [`chord-extractor-clean`](chord-extractor-clean).
- The browser extension source is at the repository root.
- Load the repository root as an unpacked extension; generated builds, local caches, and model files are intentionally not committed.
- Gemini subtitles and translations are optional cloud features. They use a key you provide in the extension settings; no API key is included in this repository.
