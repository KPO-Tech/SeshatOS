# scripts/setup.ps1
# One-command setup for SeshatOS app on Windows.
#
# What it does:
#   1. Verifies Go 1.26+ (seshat-backend)
#   2. Installs ripgrep (winget / scoop / choco) - required at runtime by the
#      engine's glob/grep tools, which shell out to `rg` directly
#   4. Verifies Node.js 22+ and bun (or npm)
#   5. Installs Node dependencies
#   6. Installs uv and docling-serve (optional - skip with $env:SKIP_PYTHON = "1")
#   7. Builds seshat-backend.exe and the Electron app
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#   $env:SKIP_PYTHON = "1"; powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#
# Environment variables:
#   SESHAT_RUNTIME_ROOT   Override data dir (default: %APPDATA%\seshat)
#   DOCLING_EXTRAS        pip extras for docling-serve (e.g. "gpu")
#   PYTHON_VERSION        Python version for the venv (default: 3.11)
#   SKIP_PYTHON           Set to 1 to skip the Python/docling setup step

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$UiDir = Join-Path $RepoRoot "seshat-desktop"
$BackendDir = Join-Path $RepoRoot "seshat-backend"

if (-not $env:SESHAT_RUNTIME_ROOT) {
    $env:SESHAT_RUNTIME_ROOT = Join-Path $env:APPDATA "seshat"
}

# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Write-Ok   { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "  [ ]  $msg" -ForegroundColor Cyan }
function Write-Warn { param($msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red; exit 1 }
function Write-Step { param($msg) Write-Host "`n$msg" -ForegroundColor White }

function Update-ProcessPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machinePath;$userPath"
}


# â”€â”€ 1. Go â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Checking Go..."

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Fail "Go not found. Install Go 1.26+ from: https://go.dev/dl/"
}

$goVer = (go version) -replace "go version go", "" -replace " .*", ""
$parts = $goVer -split "\."
$major = [int]$parts[0]
$minor = [int]$parts[1]
if ($major -lt 1 -or ($major -eq 1 -and $minor -lt 26)) {
    Write-Fail "Go $goVer found but 1.26+ required. Update at: https://go.dev/dl/"
}
Write-Ok "Go $goVer"

# â”€â”€ 2. ripgrep â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Checking ripgrep..."

if (Get-Command rg -ErrorAction SilentlyContinue) {
    $rgVer = (rg --version | Select-Object -First 1) -replace "ripgrep ", ""
    Write-Ok "ripgrep $rgVer"
} else {
    Write-Info "Installing ripgrep..."
    $installed = $false
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id BurntSushi.ripgrep.MSVC --silent --accept-source-agreements --accept-package-agreements
        $installed = $true
    } elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
        scoop install ripgrep
        $installed = $true
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install ripgrep -y
        $installed = $true
    }
    if ($installed) {
        # winget/scoop/choco write the new PATH entry to the registry
        # (User and/or Machine scope), but that's only picked up by
        # processes started *after* the write - this already-running
        # PowerShell session (and anything it shells out to, like the
        # engine's own glob/grep tools) keeps the PATH snapshot it was
        # launched with. Rebuild $env:PATH from both registry scopes now,
        # the same trick already used for uv below, so `rg` resolves
        # immediately without requiring a new terminal.
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
        if (Get-Command rg -ErrorAction SilentlyContinue) {
            Write-Ok "ripgrep installed and on PATH"
        } else {
            Write-Warn "ripgrep installed, but 'rg' still isn't resolving in this session - close and reopen your terminal (or IDE) so it re-reads PATH from the registry."
        }
    } else {
        Write-Warn "Could not auto-install ripgrep. Download from: https://github.com/BurntSushi/ripgrep/releases"
    }
}


# â”€â”€ 4. Node.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Checking Node.js..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js not found. Install Node.js 22+ from: https://nodejs.org/"
}

$nodeVer = [int]((node --version) -replace "v", "" -split "\.")[0]
if ($nodeVer -lt 22) {
    Write-Fail "Node.js v$nodeVer found but v22+ is required."
}
Write-Ok "Node.js $(node --version)"

# â”€â”€ 4. Package manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Checking package manager..."

$pkgManager = $null
if (Get-Command bun -ErrorAction SilentlyContinue) {
    $pkgManager = "bun"
    Write-Ok "bun $(bun --version)"
} elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    $pkgManager = "npm"
    Write-Ok "npm $(npm --version)"
} else {
    Write-Fail "Neither bun nor npm found."
}

# â”€â”€ 5. Install Node dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Installing Node dependencies..."

Set-Location $UiDir
if ($pkgManager -eq "bun") {
    bun install
} else {
    npm install --legacy-peer-deps
}
Write-Ok "Node dependencies installed"

# â”€â”€ 6. Python venv + docling-serve (optional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($env:SKIP_PYTHON -eq "1") {
    Write-Warn "Skipping Python/docling setup (SKIP_PYTHON=1)"
    Write-Warn "Run this script again later without SKIP_PYTHON to enable document conversion."
} else {
    Write-Step "Setting up Python environment (docling-serve)..."

    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Info "Installing uv..."
        try {
            Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
            $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + $env:PATH
        } catch {
            Write-Fail "Failed to install uv: $_`nInstall manually: https://docs.astral.sh/uv/getting-started/installation/"
        }
    }
    Write-Ok "uv $(uv --version)"

    $pythonVersion = if ($env:PYTHON_VERSION) { $env:PYTHON_VERSION } else { "3.11" }
    $venvDir = Join-Path $env:SESHAT_RUNTIME_ROOT ".venv"
    $doclingBin = Join-Path $venvDir "Scripts\docling-serve.exe"

    if (-not (Test-Path $doclingBin)) {
        Write-Info "Creating Python $pythonVersion venv at $venvDir..."
        New-Item -ItemType Directory -Force -Path $env:SESHAT_RUNTIME_ROOT | Out-Null
        uv venv $venvDir --python $pythonVersion --seed

        $pyBin = Join-Path $venvDir "Scripts\python.exe"
        $pkg = if ($env:DOCLING_EXTRAS) { "docling-serve[$env:DOCLING_EXTRAS]" } else { "docling-serve" }
        Write-Info "Installing $pkg..."
        uv pip install --python $pyBin $pkg
        Write-Ok "docling-serve installed"
    } else {
        Write-Ok "docling-serve (already installed)"
    }
}

# â”€â”€ 7. Build Go binaries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Building seshat-backend..."

Set-Location $BackendDir
go build ./...
Write-Ok "seshat-backend"

# go.work (repo root) can optionally point at a local checkout of the seshat
# engine itself (sibling directory, "use ../seshat") for engine development -
# see go.work's `use` block. Without it, seshat-backend builds fine against
# the published module instead; this is informational only.
$goWorkPath = Join-Path $RepoRoot "go.work"
if ((Test-Path $goWorkPath) -and (Select-String -Path $goWorkPath -Pattern "\.\./seshat" -Quiet)) {
    $siblingGoMod = Join-Path (Split-Path -Parent $RepoRoot) "seshat\go.mod"
    if (Test-Path $siblingGoMod) {
        Write-Ok "go.work: local seshat engine checkout found at $(Split-Path -Parent $siblingGoMod)"
    } else {
        Write-Warn "go.work references ../seshat but no go.mod was found there - Go builds will fail until that checkout exists (or remove the 'use ../seshat' line to build against the published module instead)."
    }
}

# â”€â”€ 8. Build UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Building SeshatOS UI..."

Set-Location $UiDir
if ($pkgManager -eq "bun") {
    bun run build
} else {
    npm run build --legacy-peer-deps
}
Write-Ok "Build complete -> seshat-desktop\out\"

# â”€â”€ Done â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Runtime data: $env:SESHAT_RUNTIME_ROOT"
Write-Host ""
Write-Host "  Start in dev mode (from repo root, Git Bash/PowerShell/cmd - see Makefile):"
Write-Host "    make dev"
Write-Host ""
