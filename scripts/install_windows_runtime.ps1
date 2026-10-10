param(
  [Parameter(Mandatory = $true)][string]$AppRoot,
  [Parameter(Mandatory = $true)][string]$DataRoot
)

$ErrorActionPreference = 'Stop'
$AppRoot = [System.IO.Path]::GetFullPath($AppRoot)
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$uv = Join-Path $AppRoot 'uv.exe'
$pythonDir = Join-Path $AppRoot 'runtime\python'
$venvDir = Join-Path $AppRoot 'venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$processorDir = Join-Path $AppRoot 'processor'
$requirements = Join-Path $processorDir 'requirements.windows.txt'
$cpuRequirements = Join-Path $processorDir 'requirements.windows.cpu.txt'
$cudaRequirements = Join-Path $processorDir 'requirements.windows.cuda.txt'
$wheels = Join-Path $AppRoot 'wheels'

if (-not (Test-Path -LiteralPath $uv -PathType Leaf)) {
  throw "The bundled uv runtime manager was not found: $uv"
}

New-Item -ItemType Directory -Force -Path $DataRoot, $pythonDir | Out-Null
$env:UV_PYTHON_INSTALL_DIR = $pythonDir
$env:UV_PYTHON_PREFERENCE = 'only-managed'
$env:UV_CACHE_DIR = Join-Path $AppRoot 'cache\uv'

Write-Host 'Installing the private Python 3.10 runtime...'
& $uv python install 3.10 --install-dir $pythonDir
if ($LASTEXITCODE -ne 0) { throw 'Could not install the private Python runtime.' }

$basePython = (& $uv python find 3.10 --managed-python).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $basePython -PathType Leaf)) {
  throw 'Could not locate the private Python 3.10 runtime.'
}

if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
  Write-Host 'Creating the YouChords Python environment...'
  & $uv venv --python $basePython --seed $venvDir
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the YouChords Python environment.' }
}

Write-Host 'Installing local processing and AI packages. This first setup is large and may take a while...'
& $uv pip install --python $venvPython 'setuptools<81' wheel 'Cython<3' 'numpy<2' 'scipy<2' mido
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the Python build dependencies.' }

$cudaAvailable = $false
try {
  $nvidiaSmi = Get-Command nvidia-smi.exe -ErrorAction Stop
  & $nvidiaSmi.Source --query-gpu=name --format=csv,noheader *> $null
  $cudaAvailable = $LASTEXITCODE -eq 0
} catch {
  $cudaAvailable = $false
}

if ($cudaAvailable) {
  Write-Host 'NVIDIA GPU detected. Installing the CUDA processing runtime...'
  $selectedBackendRequirements = $cudaRequirements
} else {
  Write-Host 'No usable NVIDIA GPU detected. Installing the CPU processing runtime...'
  $selectedBackendRequirements = $cpuRequirements
}
& $uv pip install --python $venvPython --find-links $wheels -r $requirements -r $selectedBackendRequirements
if ($LASTEXITCODE -ne 0) { throw 'Could not install the YouChords packages for the selected CPU/GPU runtime.' }

Write-Host 'Windows local processor packages are ready.' -ForegroundColor Green
exit 0
