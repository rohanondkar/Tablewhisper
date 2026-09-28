# Build the Steam edition into G:\Discord Bot\Tablewhisper.
# This repo stays the browser edition. The exe, Python, packages, and saves live next door.
# Mac builds are separate (GitHub Actions → Releases); they never write here.
$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent $PSScriptRoot
$Steam = "G:\Discord Bot\Tablewhisper"
$Cache = "G:\Discord Bot\Tablewhisper-build-cache"
$PyVersion = "3.12.8"
$Desktop = Join-Path $Repo "apps\desktop"
$ApiSrc = Join-Path $Repo "apps\api"
$Packages = Join-Path $Repo "packages"
$Packaged = Join-Path $Desktop "packaged-resources"
$BuilderYml = Join-Path $Desktop "electron-builder.yml"

New-Item -ItemType Directory -Force -Path $Cache | Out-Null

Write-Host "Building the UI..."
Push-Location $Desktop
try {
  if (-not (Test-Path "node_modules\electron-builder")) {
    npm.cmd install --save-dev electron-builder
    if ($LASTEXITCODE -ne 0) { throw "npm install electron-builder failed" }
  }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "UI build failed" }
} finally {
  Pop-Location
}

$PyDir = Join-Path $Cache "python"
if (-not (Test-Path (Join-Path $PyDir "python.exe"))) {
  Write-Host "Downloading embeddable Python $PyVersion..."
  $zip = Join-Path $Cache "python-$PyVersion-embed-amd64.zip"
  curl.exe -L --fail -o $zip "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip"
  if ($LASTEXITCODE -ne 0) { throw "Python download failed" }
  if (Test-Path $PyDir) { Remove-Item -Recurse -Force $PyDir }
  Expand-Archive -Path $zip -DestinationPath $PyDir
  $pth = Get-ChildItem $PyDir -Filter "python*._pth" | Select-Object -First 1
  if (-not $pth) { throw "Embeddable Python ._pth file not found" }
  @(
    "python312.zip"
    "."
    "Lib\site-packages"
    "import site"
  ) | Set-Content -Path $pth.FullName -Encoding ascii
  $getPip = Join-Path $Cache "get-pip.py"
  curl.exe -L --fail -o $getPip "https://bootstrap.pypa.io/get-pip.py"
  if ($LASTEXITCODE -ne 0) { throw "get-pip download failed" }
  & (Join-Path $PyDir "python.exe") $getPip
  if ($LASTEXITCODE -ne 0) { throw "get-pip failed" }
}

Write-Host "Installing API packages into the bundled Python..."
$python = Join-Path $PyDir "python.exe"
& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $ApiSrc "requirements.txt")
if ($LASTEXITCODE -ne 0) {
  Write-Host "Full requirements did not install. Installing the packages the API needs to start..."
  & $python -m pip install "fastapi>=0.115.0" "uvicorn[standard]>=0.32.0" "pypdf>=5.0.0" "python-multipart>=0.0.12" "httpx>=0.27.0" "pydantic>=2.9.0" "numpy>=2.0.0" "Pillow>=10.0.0"
  if ($LASTEXITCODE -ne 0) { throw "API package install failed" }
}

Write-Host "Staging packaged-resources for electron-builder..."
if (Test-Path $Packaged) { Remove-Item -Recurse -Force $Packaged }
New-Item -ItemType Directory -Force -Path (Join-Path $Packaged "python") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Packaged "api") | Out-Null
& robocopy $PyDir (Join-Path $Packaged "python") /E /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -ge 8) { throw "Copying Python into packaged-resources failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0
& robocopy $ApiSrc (Join-Path $Packaged "api") /E /NFL /NDL /NJH /NJS /XD .venv __pycache__ .pytest_cache /XF *.pyc
if ($LASTEXITCODE -ge 8) { throw "Copying the API into packaged-resources failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

$outPath = (($Cache + "\out") -replace "\\", "/")
if (-not (Test-Path $BuilderYml)) { throw "Missing $BuilderYml" }

Write-Host "Packaging Tablewhisper.exe..."
Push-Location $Desktop
try {
  npx.cmd electron-builder --win dir --config electron-builder.yml "-c.directories.output=$outPath"
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
} finally {
  Pop-Location
}

$unpacked = Join-Path $Cache "out\win-unpacked"
if (-not (Test-Path (Join-Path $unpacked "Tablewhisper.exe"))) {
  throw "Tablewhisper.exe was not produced"
}

$dataHold = Join-Path $Cache "data-hold"
if (Test-Path $dataHold) { Remove-Item -Recurse -Force $dataHold }
if (Test-Path (Join-Path $Steam "data")) {
  Move-Item (Join-Path $Steam "data") $dataHold
}
if (Test-Path $Steam) { Remove-Item -Recurse -Force $Steam }
Move-Item $unpacked $Steam
if (Test-Path $dataHold) {
  Move-Item $dataHold (Join-Path $Steam "data")
}
if (-not (Test-Path (Join-Path $Steam "data"))) {
  New-Item -ItemType Directory -Path (Join-Path $Steam "data") | Out-Null
}

Write-Host ""
Write-Host "Steam edition is ready:"
Write-Host "  $Steam\Tablewhisper.exe"
Write-Host "Add that exe as a non-Steam game. Leave launch options empty."
Write-Host "Mac builds are separate - use GitHub Actions Release Mac (not this folder)."
