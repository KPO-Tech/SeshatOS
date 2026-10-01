import { randomBytes, createHmac } from 'crypto'
import { mkdir, open, readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:8090'
const DESKTOP_SECRET_FILE = 'desktop-bridge-secret'

export function resolveRuntimeRoot() {
  const explicit = (process.env.SESHAT_RUNTIME_ROOT ?? process.env.NEXUS_RUNTIME_ROOT)?.trim()
  if (explicit) return explicit
  return join(app.getPath('home'), '.config', 'seshat')
}

// Set once by backend-process.ts after spawning the bundled sidecar and
// discovering which port it actually bound to (the preferred one may have
// been taken, see SESHAT_BACKEND_READY in cmd/api/main.go). Only relevant
// in a packaged app — dev mode never spawns a sidecar, so this stays null
// and resolveBackendOrigin() falls through to the env var / default below.
let dynamicBackendOrigin: string | null = null

export function setDynamicBackendOrigin(origin: string) {
  dynamicBackendOrigin = origin.replace(/\/$/, '')
}

export function resolveBackendOrigin() {
  const explicit = (process.env.SESHAT_BACKEND_ORIGIN ?? process.env.NEXUS_BACKEND_ORIGIN)?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return dynamicBackendOrigin || DEFAULT_BACKEND_ORIGIN
}

export function getDesktopBridgeSecretPath() {
  return join(resolveRuntimeRoot(), 'data', DESKTOP_SECRET_FILE)
}

function decodeHexSecret(raw: string) {
  const value = raw.trim()
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    throw new Error('desktop bridge secret is not valid hex')
  }
  const secret = Buffer.from(value, 'hex')
  if (secret.length < 32) {
    throw new Error('desktop bridge secret is too short')
  }
  return secret
}

export async function ensureDesktopBridgeSecret() {
  const path = getDesktopBridgeSecretPath()
  try {
    return decodeHexSecret(await readFile(path, 'utf-8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw error
    }
  }

  await mkdir(join(resolveRuntimeRoot(), 'data'), { recursive: true, mode: 0o700 })
  const raw = randomBytes(32)
  const encoded = raw.toString('hex')

  try {
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(encoded, 'utf-8')
    } finally {
      await handle.close()
    }
    return raw
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      return decodeHexSecret(await readFile(path, 'utf-8'))
    }
    throw error
  }
}

export function desktopBridgeProof(secret: Uint8Array, nonce: string) {
  return createHmac('sha256', secret).update(nonce, 'utf-8').digest('hex')
}
