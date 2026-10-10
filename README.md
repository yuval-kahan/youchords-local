# YouChords Local

A Chromium extension that adds chord, subtitle, and practice tools to YouTube. Chord extraction, transcription, and audio processing run through the local companion service.

## Run locally

Requirements: Chrome or another Chromium browser, Docker Desktop, and an NVIDIA GPU for GPU accelerated processing.

1. Start the local processor from the repository root:

   ```powershell
   docker compose -f docker-compose.local.yml up --build -d
   ```

2. Check that it is ready:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:8765/v1/health
   ```

3. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this repository root (the folder containing `manifest.json`).

## Optional Gemini features

Gemini subtitles and translations are optional. Add your own Gemini API key in the extension settings if you want to use them. The key is saved in browser storage and must never be committed to this repository. Enabling Gemini sends requests to Google's Gemini API; local chord and transcription processing uses the local companion service.

## Local data and credentials

The companion service binds to `127.0.0.1`. Models, caches, and generated results stay in local Docker volumes or browser storage. Do not commit `.env` files, cookies, account lists, credentials, or generated model/output directories.
