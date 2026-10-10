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
- Uses an NVIDIA GPU for WhisperX and audio separation when available in the selected processor.
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

## Quick start on Windows

Choose either processor. Both can be installed at once and use separate local addresses.

- Google Chrome or another Chromium browser.
- An NVIDIA GPU and a current NVIDIA driver for GPU accelerated transcription and audio separation.
- A reliable internet connection for the first installation and model downloads.

### Windows installer

Download and run [YouChords-Local-Windows-Setup.exe](https://github.com/yuval-kahan/youchords-local/releases/latest/download/YouChords-Local-Windows-Setup.exe). It installs the Windows processor for the current user, starts it at sign-in, and uses port `8766`. The first setup downloads a private Python runtime and the AI packages, so allow time and several gigabytes of free disk space.

In the extension popup, choose **Windows · port 8766** under **PROCESSOR**.

### Docker processor

Install Docker Desktop with its WSL 2 backend and NVIDIA GPU support. Then start the processor:

```powershell
.\scripts\start_youchords_local.ps1
```

Check that it is ready:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/v1/health
```

The Docker processor keeps using port `8765`. In the extension popup, choose **Docker · port 8765** under **PROCESSOR**. The initial Docker build downloads dependencies and may take a while.

### Load the extension in Chrome

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository folder containing `manifest.json`.

Open a YouTube music video and use the YouChords buttons next to the player controls.

If both processors are running, the popup's **PROCESSOR** selector decides which one handles new work. Results and caches stay separate for each installation.

## Install with Codex or another AI coding assistant

Codex can help install either local processor and guide you through loading the extension. The first setup downloads dependencies and may take a while. The extension must still be loaded in Chrome from the repository folder containing `manifest.json`.

If the repository is not already open in Codex, ask it to clone `https://github.com/yuval-kahan/youchords-local` into your workspace. Then paste this prompt:

```text
Set up YouChords Local from this repository for local use on this computer.

Read the README and inspect the relevant installer or setup script before running it. Ask whether I want the Windows installer or Docker. For the Windows installer, download YouChords-Local-Windows-Setup.exe from the latest GitHub release and run it, then check http://127.0.0.1:8766/v1/health. For Docker, check that Docker Desktop is available, run .\scripts\start_youchords_local.ps1, then check http://127.0.0.1:8765/v1/health. Report whether the selected processor is ready and tell me if a prerequisite is missing.

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

The selected local companion service handles expensive tasks in a FIFO queue, so Whisper, chord extraction, and audio separation do not compete for the GPU on long videos. Docker uses `http://127.0.0.1:8765`; the Windows install uses `http://127.0.0.1:8766`.

- **Docker models and results** stay in `.youchords-local` beside the repository.
- **Windows models and results** stay under `%LOCALAPPDATA%\YouChordsLocal`.
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

### Downloads or long-video processing fail

Open the extension popup and approve any pending `yt-dlp` update. If a job is already running, wait for it to finish and approve again. For long videos, leave the page open while the local queue finishes its earlier jobs.

### Whisper does not use the GPU

Run the selected processor's health check. If it does not say `device: cuda`, make sure the NVIDIA driver is installed and the selected processor can access the GPU, then restart that processor.

For Docker:

```powershell
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up --build -d
```

## Security

This repository must never contain API keys, passwords, private keys, browser tokens, or local `.env` files. Keep credentials in local ignored configuration only, rotate anything that was ever exposed, and review `git status` before committing.

## Development notes

- The local companion source is in [`chord-extractor-clean`](chord-extractor-clean).
- The browser extension source is at the repository root.
- Load the repository root as an unpacked extension; generated builds, local caches, and model files are intentionally not committed.
- Gemini subtitles and translations are optional cloud features. They use a key you provide in the extension settings; no API key is included in this repository.
