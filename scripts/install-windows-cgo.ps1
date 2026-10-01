param(
  [switch]$SkipWinget
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "[cgo] $Message" -ForegroundColor Green
}

function Find-MsysRoot {
  $candidates = @(
    $env:MSYS2_ROOT,
    "C:\msys64",
    "$env:LOCALAPPDATA\Programs\MSYS2"
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($candidate in $candidates) {
    $bash = Join-Path $candidate "usr\bin\bash.exe"
    if (Test-Path $bash) {
      return (Resolve-Path $candidate).Path
    }
  }
  return $null
}

function Ensure-UserPathEntry($Entry) {
  $current = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($current) {
    $parts = $current.Split(";") | Where-Object { $_ }
  }
  if ($parts -notcontains $Entry) {
    $next = (($parts + $Entry) -join ";")
    [Environment]::SetEnvironmentVariable("Path", $next, "User")
  }
}

$msysRoot = Find-MsysRoot
if (-not $msysRoot) {
  if ($SkipWinget) {
    throw "MSYS2 was not found. Install it first, then rerun without -SkipWinget."
  }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is not available. Install MSYS2 manually from https://www.msys2.org/, then run this script again."
  }
  Write-Step "Installing MSYS2 with winget..."
  winget install --id MSYS2.MSYS2 --source winget --accept-package-agreements --accept-source-agreements
  $msysRoot = Find-MsysRoot
  if (-not $msysRoot) {
    throw "MSYS2 install completed, but MSYS2 was not found in a known location. Set MSYS2_ROOT and rerun."
  }
}

$bash = Join-Path $msysRoot "usr\bin\bash.exe"
$mingwBin = Join-Path $msysRoot "mingw64\bin"

Write-Step "Updating MSYS2 package database..."
& $bash -lc "pacman -Sy --noconfirm"

Write-Step "Installing MinGW-w64 GCC toolchain..."
& $bash -lc "pacman -S --needed --noconfirm mingw-w64-x86_64-gcc mingw-w64-x86_64-pkgconf make unzip tar curl"

Write-Step "Adding MinGW-w64 bin directory to the user PATH..."
Ensure-UserPathEntry $mingwBin

$env:Path = "$mingwBin;$env:Path"
Write-Step "Checking gcc..."
& (Join-Path $mingwBin "gcc.exe") --version | Select-Object -First 1

Write-Host ""
Write-Host "CGO toolchain is ready." -ForegroundColor Green
Write-Host "Open a new terminal, then run: make dev-native"
