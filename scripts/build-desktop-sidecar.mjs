#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const nativeDoc = args.includes('--nativedoc') || process.env.SESHAT_BUILD_NATIVEDOC === '1'
const positional = args.filter((arg) => arg !== '--nativedoc')
const target = positional[0]
const arch = positional[1] || 'amd64'

const targets = {
  windows: { goos: 'windows', ext: '.exe' },
  win: { goos: 'windows', ext: '.exe' },
  linux: { goos: 'linux', ext: '' },
  darwin: { goos: 'darwin', ext: '' },
  mac: { goos: 'darwin', ext: '' },
}

const selected = targets[target]
if (!selected) {
  console.error('Usage: node scripts/build-desktop-sidecar.mjs <windows|linux|darwin> [amd64|arm64] [--nativedoc]')
  process.exit(2)
}

const outDir = resolve(repoRoot, 'seshat-desktop', 'resources', 'backend')
const outPath = resolve(outDir, `seshat-backend${selected.ext}`)
mkdirSync(outDir, { recursive: true })

// electron-builder's extraResources bundles every file in outDir as-is, and
// Linux/macOS binaries share the exact same filename ("seshat-backend", no
// extension) — see resources/backend/README.md. Without this cleanup, a
// stray binary from a previous build for a different platform can either
// silently overwrite the wrong content (linux <-> darwin, same filename) or
// linger alongside the new one and get bundled into an installer that will
// never run it (e.g. a leftover Linux ELF shipped inside the Windows NSIS
// package). Remove every other-platform output before building this one, so
// outDir always contains exactly one binary: the one just built.
for (const other of Object.values(targets)) {
  if (other === selected) continue
  const otherPath = resolve(outDir, `seshat-backend${other.ext}`)
  if (otherPath !== outPath) {
    rmSync(otherPath, { force: true })
  }
}

let result
if (nativeDoc) {
  const hostGoos = process.platform === 'win32' ? 'windows' : process.platform
  if (hostGoos !== selected.goos) {
    console.error(`nativedoc sidecars use CGO and must be built on the target OS (host=${hostGoos}, target=${selected.goos}).`)
    process.exit(2)
  }
  const setupScript = resolve(repoRoot, 'scripts', 'setup-nativedoc-cgo.sh')
  const backendDir = resolve(repoRoot, 'seshat-backend')
  const quotedSetup = shQuote(toSlash(setupScript))
  const quotedOut = shQuote(toSlash(outPath))
  const quotedOutDir = shQuote(toSlash(outDir))
  const shell = process.platform === 'win32' ? findWindowsBash() : 'bash'
  if (!shell) {
    console.error('nativedoc build requires bash. Install Git for Windows or MSYS2, then retry.')
    process.exit(2)
  }
  const setupRunner = process.platform === 'win32' ? shQuote(toSlash(shell)) : 'bash'
  const command = [
    `eval "$(${setupRunner} ${quotedSetup})"`,
    `CGO_ENABLED=1 GOOS=${shQuote(selected.goos)} GOARCH=${shQuote(arch)} go build -tags "$NATIVEDOC_BUILD_TAGS" -o ${quotedOut} ./cmd/api`,
    copyRuntimeLibsCommand(selected.goos, quotedOutDir),
  ].filter(Boolean).join(' && ')
  result = spawnSync(shell, ['-lc', command], {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  })
} else {
  cleanupNativeRuntimeFiles(outDir)
  result = spawnSync('go', ['build', '-o', outPath, './cmd/api'], {
    cwd: resolve(repoRoot, 'seshat-backend'),
    stdio: 'inherit',
    env: {
      ...process.env,
      CGO_ENABLED: process.env.CGO_ENABLED || '0',
      GOOS: selected.goos,
      GOARCH: arch,
    },
  })
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

writeNativeDocMarker(outDir, nativeDoc)
console.log(`Built ${selected.goos}/${arch}${nativeDoc ? ' nativedoc' : ''} sidecar: ${outPath}`)

function toSlash(path) {
  return path.replaceAll('\\', '/')
}

function shQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function findWindowsBash() {
  const candidates = [
    process.env.BASH,
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files (x86)/Git/bin/bash.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Programs/Git/bin/bash.exe` : null,
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return 'bash'
}

function copyRuntimeLibsCommand(goos, quotedOutDir) {
  if (goos === 'windows') {
    return [
      'pdfium_dll="$(command -v pdfium.dll || true)"',
      '[ -n "$pdfium_dll" ] || { echo "pdfium.dll not found on PATH after nativedoc setup" >&2; exit 1; }',
      `cp "$pdfium_dll" ${quotedOutDir}/pdfium.dll`,
      '[ -n "${SESHAT_NATIVEDOC_ONNXRUNTIME_PATH:-}" ] || { echo "SESHAT_NATIVEDOC_ONNXRUNTIME_PATH missing after nativedoc setup" >&2; exit 1; }',
      `cp "$SESHAT_NATIVEDOC_ONNXRUNTIME_PATH" ${quotedOutDir}/onnxruntime.dll`,
    ].join(' && ')
  }
  if (goos === 'linux') {
    return [
      'pdfium_so="$(find "${LD_LIBRARY_PATH%%:*}" -maxdepth 1 -name "libpdfium.so*" | head -1)"',
      '[ -n "$pdfium_so" ] || { echo "libpdfium.so not found after nativedoc setup" >&2; exit 1; }',
      `cp "$pdfium_so" ${quotedOutDir}/libpdfium.so`,
    ].join(' && ')
  }
  if (goos === 'darwin') {
    return [
      'pdfium_dylib="$(find "${DYLD_LIBRARY_PATH%%:*}" -maxdepth 1 -name "libpdfium.dylib*" | head -1)"',
      '[ -n "$pdfium_dylib" ] || { echo "libpdfium.dylib not found after nativedoc setup" >&2; exit 1; }',
      `cp "$pdfium_dylib" ${quotedOutDir}/libpdfium.dylib`,
    ].join(' && ')
  }
  return ''
}

function cleanupNativeRuntimeFiles(dir) {
  for (const name of ['pdfium.dll', 'onnxruntime.dll', 'libpdfium.so', 'libpdfium.dylib', '.nativedoc-enabled']) {
    rmSync(resolve(dir, name), { force: true })
  }
}

function writeNativeDocMarker(dir, enabled) {
  const marker = resolve(dir, '.nativedoc-enabled')
  rmSync(marker, { force: true })
  if (enabled) copyFileSync(resolve(repoRoot, 'scripts', 'setup-nativedoc-cgo.sh'), marker)
}
