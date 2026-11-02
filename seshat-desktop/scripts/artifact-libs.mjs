#!/usr/bin/env node
// The web libraries shipped for the pages the agent makes (see seshat-backend/internal/artifactlibs and artifact-libs.json).
//
//   node scripts/artifact-libs.mjs          fetch: download the locked files into resources/artifact-libs, check each SHA-256, and remove
//                                           whatever the lock no longer names (an older version). Files already there and intact are kept.
//   node scripts/artifact-libs.mjs lock     expand each library's include list and record the SHA-256 of every file in artifact-libs.json.
//   node scripts/artifact-libs.mjs update   move each library to the newest release it is compatible with (same major, same minor below
//                                           1.0), then lock. A new major is a deliberate edit of artifact-libs.json.
//
// Files come from jsDelivr (or a library's own source). The folder is not in git: packaging and make dev run fetch.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(desktopDir, 'artifact-libs.json')
const outDir = join(desktopDir, 'resources', 'artifact-libs')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}

async function getJSON(url) {
  return JSON.parse((await download(url)).toString('utf8'))
}

function sourceOf(lib, file) {
  return lib.source ?? `https://cdn.jsdelivr.net/npm/${lib.name}@${lib.version}/${file}`
}

function targetOf(lib, file) {
  return join(outDir, `${lib.name}@${lib.version}`, ...file.split('/'))
}

// The files of a package version matching include, where a * stands for one path segment (no slash).
async function expandInclude(lib) {
  if (!lib.include.some((pattern) => pattern.includes('*'))) return lib.include
  const listing = await getJSON(`https://data.jsdelivr.com/v1/packages/npm/${lib.name}@${lib.version}?structure=flat`)
  const files = listing.files.map((entry) => entry.name.replace(/^\//, ''))
  const out = []
  for (const pattern of lib.include) {
    if (!pattern.includes('*')) {
      out.push(pattern)
      continue
    }
    const re = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
    const matched = files.filter((file) => re.test(file))
    if (matched.length === 0) throw new Error(`${lib.name}@${lib.version}: nothing matches ${pattern}`)
    out.push(...matched)
  }
  return [...new Set(out)].sort()
}

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'))
}

async function saveManifest(manifest) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function lockLibrary(lib) {
  const files = {}
  for (const file of await expandInclude(lib)) {
    const bytes = await download(sourceOf(lib, file))
    files[file] = sha256(bytes)
    const target = targetOf(lib, file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  lib.files = files
}

async function lock() {
  const manifest = await loadManifest()
  for (const lib of manifest.libraries) {
    await lockLibrary(lib)
    console.log(`locked ${lib.name}@${lib.version} (${Object.keys(lib.files).length} files)`)
  }
  await saveManifest(manifest)
}

// What a newer release must share with the current one: the major, or 0.<minor> below 1.0 (same rule as majorOf in the backend).
function compatibleRange(version) {
  const [major, minor] = version.split('.')
  return major === '0' ? `~0.${minor}` : `^${major}`
}

async function update() {
  const manifest = await loadManifest()
  for (const lib of manifest.libraries) {
    if (lib.source) continue
    const resolved = await getJSON(`https://data.jsdelivr.com/v1/packages/npm/${lib.name}/resolved?specifier=${encodeURIComponent(compatibleRange(lib.version))}`)
    if (!resolved.version || resolved.version === lib.version) continue
    console.log(`${lib.name}: ${lib.version} -> ${resolved.version}`)
    lib.version = resolved.version
    await lockLibrary(lib)
  }
  await saveManifest(manifest)
}

async function listFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(path)))
    else out.push(path)
  }
  return out
}

async function removeEmptyDirs(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name)
    await removeEmptyDirs(path)
    if ((await readdir(path)).length === 0) await rmdir(path)
  }
}

async function fetchAll() {
  const manifest = await loadManifest()
  const wanted = new Set([join(outDir, 'manifest.json')])
  let downloaded = 0
  let total = 0
  for (const lib of manifest.libraries) {
    if (!lib.files) throw new Error(`${lib.name} is not locked: run node scripts/artifact-libs.mjs lock`)
    for (const [file, hash] of Object.entries(lib.files)) {
      const target = targetOf(lib, file)
      wanted.add(target)
      if (existsSync(target) && sha256(await readFile(target)) === hash) {
        total += (await readFile(target)).length
        continue
      }
      const bytes = await download(sourceOf(lib, file))
      if (sha256(bytes) !== hash) throw new Error(`${lib.name}@${lib.version}/${file}: SHA-256 does not match the lock`)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
      downloaded++
      total += bytes.length
    }
  }
  for (const path of await listFiles(outDir)) {
    if (!wanted.has(path)) {
      await rm(path)
      console.log(`removed ${relative(outDir, path).split(sep).join('/')}`)
    }
  }
  await mkdir(outDir, { recursive: true })
  await removeEmptyDirs(outDir)
  const shipped = manifest.libraries.map(({ name, version, host, main, files }) => ({ name, version, ...(host ? { host } : {}), main, files }))
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify({ libraries: shipped }, null, 2)}\n`)
  console.log(`artifact libraries: ${manifest.libraries.length} libraries, ${(total / 1024 / 1024).toFixed(1)} MB, ${downloaded} downloaded`)
}

const command = process.argv[2] ?? 'fetch'
const run = { fetch: fetchAll, lock, update }[command]
if (!run) {
  console.error(`unknown command ${command}: fetch, lock or update`)
  process.exit(2)
}
run().catch((error) => {
  console.error(`artifact-libs ${command}: ${error.message}`)
  process.exit(1)
})
