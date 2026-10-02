import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, relative, resolve as resolvePath } from 'path'
import { createServer } from 'net'
import JSZip from 'jszip'

// Shared by the local-runtime managers (whisper.cpp, llama.cpp): both download a
// prebuilt binary archive plus model files, then run a localhost server.

export async function downloadToFile(url: string, destPath: string, onProgress?: (receivedBytes: number, totalBytes: number) => void) {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status}): ${url}`)
  }
  const totalBytes = Number(res.headers.get('content-length') ?? 0)
  let receivedBytes = 0

  await mkdir(join(destPath, '..'), { recursive: true })
  const fileStream = createWriteStream(destPath)
  const reader = res.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      await new Promise<void>((resolve, reject) => {
        fileStream.write(value, (err) => (err ? reject(err) : resolve()))
      })
      onProgress?.(receivedBytes, totalBytes)
    }
  } finally {
    reader.releaseLock()
    await new Promise<void>((resolve) => fileStream.end(resolve))
  }
}

// Windows .zip assets are extracted with the bundled jszip (pure JS, already
// a project dependency) instead of shelling out to whatever `tar` resolves
// to on PATH - on Windows that's fragile in practice: pre-1803 builds ship
// no tar.exe at all, Git/MSYS/Cygwin can shadow it with a GNU tar that can't
// read zip, and antivirus quarantining a freshly-written unsigned .exe/.dll
// mid-extraction kills the child process with a bare, undiagnosable exit
// code. Linux's .tar.gz asset still goes through system tar, which is
// universal and reliable there.
export async function extractZipArchive(archivePath: string, destDir: string): Promise<void> {
  const buffer = await readFile(archivePath)
  const zip = await JSZip.loadAsync(buffer)
  const destRoot = resolvePath(destDir)
  for (const entry of Object.values(zip.files)) {
    const outPath = resolvePath(destDir, entry.name)
    // Zip-slip guard: refuse any entry whose resolved path escapes destDir.
    const rel = relative(destRoot, outPath)
    if (rel.startsWith('..')) {
      throw new Error(`refusing to extract entry outside destination: ${entry.name}`)
    }
    if (entry.dir) {
      await mkdir(outPath, { recursive: true })
      continue
    }
    await mkdir(join(outPath, '..'), { recursive: true })
    const content = await entry.async('nodebuffer')
    await writeFile(outPath, content)
  }
}

export function extractTarArchive(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', archivePath, '-C', destDir])
    let stderr = ''
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar extraction failed (code ${code}): ${stderr}`))
    })
  })
}

export function extractArchive(archivePath: string, destDir: string): Promise<void> {
  if (archivePath.toLowerCase().endsWith('.zip')) {
    return extractZipArchive(archivePath, destDir)
  }
  return extractTarArchive(archivePath, destDir)
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error('could not determine a free port'))
      })
    })
  })
}

export async function waitUntilReady(port: number, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' })
      // Both whisper-server and llama-server answer on any route (even 404s) once they're
      // actually listening; a thrown fetch error means "not up yet".
      if (res) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${label} did not become ready in time`)
}

