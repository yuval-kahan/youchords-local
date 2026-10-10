$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

docker compose -f docker-compose.local.yml up --build -d

Write-Host ''
Write-Host 'YouChords Local is starting.' -ForegroundColor Green
Write-Host 'Health: http://127.0.0.1:8765/v1/health'
Write-Host 'Logs:   docker compose -f docker-compose.local.yml logs -f'
