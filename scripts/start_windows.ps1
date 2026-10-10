$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
$DataRoot = Join-Path $env:LOCALAPPDATA 'YouChordsLocal'
$ProcessorRoot = Join-Path $AppRoot 'processor'
$Python = Join-Path $AppRoot 'venv\Scripts\python.exe'
$NodeRoot = Join-Path $AppRoot 'node'
$SonicRoot = Join-Path $AppRoot 'sonic-annotator'
$VampRoot = Join-Path $AppRoot 'vamp_plugins_windows'
$LogRoot = Join-Path $DataRoot 'logs'

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
  throw 'YouChords Windows has not completed its first setup. Run the installer again.'
}

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8766/v1/health' -TimeoutSec 2
  if ($health.success) { exit 0 }
} catch {
  # No Windows processor is listening yet.
}

New-Item -ItemType Directory -Force -Path $LogRoot, (Join-Path $DataRoot 'output'), (Join-Path $DataRoot 'temp') | Out-Null
$sitePackages = Join-Path $AppRoot 'venv\Lib\site-packages'
$ffmpeg = (& $Python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())').Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) {
  throw 'The local FFmpeg package is missing. Run the installer again to repair the processor.'
}

$env:YOUCHORDS_LOCAL_PORT = '8766'
$env:YOUCHORDS_LOCAL_HOST = '127.0.0.1'
$env:YOUCHORDS_LOCAL_DATA_DIR = $DataRoot
$env:YOUCHORDS_YTDLP_DATA_DIR = Join-Path $DataRoot 'yt-dlp'
$env:YOUCHORDS_SONIC_ANNOTATOR_BIN = Join-Path $SonicRoot 'sonic-annotator.exe'
$env:YOUCHORDS_SONIC_ANNOTATOR_LIB = $SonicRoot
$env:YOUCHORDS_VAMP_PATH = $VampRoot
$env:YOUCHORDS_REGULAR_ENGINE = 'madmom'
$env:YOUCHORDS_DEMUCS_MODEL = 'htdemucs_6s'
$env:YOUCHORDS_DEMUCS_DEVICE = 'cuda'
$env:YOUCHORDS_VOCAL_MUSIC_MODEL = 'melband-roformer-kim-vocals'
$env:YOUCHORDS_MELBAND_MODEL_ROOT = Join-Path $DataRoot 'output\models\melband'
$env:YOUCHORDS_WHISPER_MODEL = 'large-v2'
$env:YOUCHORDS_WHISPER_DEVICE = 'cuda'
$env:YOUCHORDS_WHISPER_MODEL_ROOT = Join-Path $DataRoot 'models\whisper'
$env:YOUCHORDS_WHISPER_ENGINE = 'whisperx'
$env:YOUCHORDS_WHISPERX_BATCH_SIZE = '8'
$env:SUBFLOW_API_BASE = 'http://127.0.0.1:18000'
$env:HF_HOME = Join-Path $DataRoot 'models\huggingface'
$env:PATH = @(
  $NodeRoot,
  (Split-Path -Parent $ffmpeg),
  (Join-Path $sitePackages 'nvidia\cudnn\bin'),
  (Join-Path $sitePackages 'nvidia\cublas\bin'),
  (Join-Path $sitePackages 'nvidia\cuda_runtime\bin'),
  (Join-Path $AppRoot 'venv\Scripts'),
  $env:PATH
) -join ';'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $LogRoot "service-$stamp.out.log"
$stderrLog = Join-Path $LogRoot "service-$stamp.err.log"
$serverScript = Join-Path $ProcessorRoot 'local_companion.py'
Start-Process -FilePath $Python `
  -ArgumentList "`"$serverScript`"" `
  -WorkingDirectory $ProcessorRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog | Out-Null
