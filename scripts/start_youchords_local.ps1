$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$baseCompose = @('-f', 'docker-compose.local.yml')
$nvidiaSmi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
$cudaAvailable = $false
if ($nvidiaSmi) {
  & $nvidiaSmi.Source --query-gpu=name --format=csv,noheader *> $null
  $cudaAvailable = $LASTEXITCODE -eq 0
}

if ($cudaAvailable) {
  Write-Host 'NVIDIA GPU detected. Trying the Docker GPU runtime...'
  docker compose @baseCompose -f docker-compose.gpu.yml up --build -d
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Docker GPU access is unavailable. Starting the processor on CPU instead.'
    docker compose @baseCompose down
    docker compose @baseCompose up --build -d
  }
} else {
  Write-Host 'No NVIDIA GPU detected. Starting the processor on CPU.'
  docker compose @baseCompose up --build -d
}
if ($LASTEXITCODE -ne 0) { throw 'Could not start the Docker processor.' }

Write-Host ''
Write-Host 'YouChords Local is starting.' -ForegroundColor Green
Write-Host 'Health: http://127.0.0.1:8765/v1/health'
Write-Host 'Logs:   docker compose -f docker-compose.local.yml logs -f'
