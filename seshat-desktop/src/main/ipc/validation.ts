import { basename, isAbsolute, relative, resolve, sep } from 'path'
import { resolveRuntimeRoot } from '../runtime'

const API_PATH_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/%?-]*$/
const SECRET_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/
const MAX_SAVE_CONTENT_BYTES = 25 * 1024 * 1024

export function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

export function normalizeAPIPath(value: unknown): string {
  const path = assertString(value, 'API path')
  if (!path.startsWith('/')) {
    throw new Error('API path must start with /')
  }
  if (path.startsWith('//')) {
    throw new Error('API path must not be absolute')
  }
  if (path.includes('\\')) {
    throw new Error('API path must use forward slashes')
  }
  if (!API_PATH_PATTERN.test(path)) {
    throw new Error('API path contains unsupported characters')
  }
  return path
}

export function assertLocalFilePath(value: unknown, label = 'File path'): string {
  const filePath = assertString(value, label)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filePath) || /^file:/i.test(filePath)) {
    throw new Error(`${label} must be a local filesystem path, not a URL`)
  }
  if (filePath.includes('\0')) {
    throw new Error(`${label} must not contain null bytes`)
  }
  if (!isAbsolute(filePath)) {
    throw new Error(`${label} must be absolute`)
  }
  return filePath
}

// Stricter than assertLocalFilePath: also requires the path to resolve
// inside this app's own data root (SESHAT_RUNTIME_ROOT/NEXUS_RUNTIME_ROOT,
// or its default under the user's home directory — see resolveRuntimeRoot).
//
// Use this for handlers that read/open a path supplied by the renderer from
// backend-controlled data (e.g. an attachment's local_path from a file API
// response) — every current caller already only ever passes such a path, so
// this changes nothing for them. It exists as defense in depth: without it,
// a future source of local_path that's less trustworthy than "this app's own
// upload response" (a synced session from another device, a compromised or
// buggy MCP server, a malicious backend) could make these handlers read,
// reveal, or open an arbitrary file anywhere the OS user account can access.
// Deliberately NOT applied to save-file/select-file/openDirectory — those
// paths come from a native OS dialog the user drove directly, not from
// renderer-supplied data, so there's nothing to contain.
export function assertPathWithinRuntimeRoot(value: unknown, label = 'File path'): string {
  const filePath = assertLocalFilePath(value, label)
  const root = resolve(resolveRuntimeRoot())
  const resolved = resolve(filePath)
  const rel = relative(root, resolved)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} must be within the app's data directory`)
  }
  return resolved
}

export function sanitizeSaveFileInput(defaultName: unknown, content: unknown): { defaultName: string; content: string } {
  const name = assertString(defaultName, 'Default file name')
  if (name !== basename(name)) {
    throw new Error('Default file name must not contain path separators')
  }
  if (name.includes('\0')) {
    throw new Error('Default file name must not contain null bytes')
  }
  if (typeof content !== 'string') {
    throw new Error('File content must be a string')
  }
  if (Buffer.byteLength(content, 'utf-8') > MAX_SAVE_CONTENT_BYTES) {
    throw new Error('File content is too large')
  }
  return { defaultName: name, content }
}

export function normalizeSecretKey(value: unknown): string {
  const key = assertString(value, 'Secret key')
  if (!SECRET_KEY_PATTERN.test(key)) {
    throw new Error('Secret key contains unsupported characters')
  }
  return key
}

export function assertUploadPayloadShape(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Upload payload must be an object')
  }
  const candidate = payload as { fields?: unknown; files?: unknown }
  if (candidate.fields !== undefined && !Array.isArray(candidate.fields)) {
    throw new Error('Upload fields must be an array')
  }
  if (candidate.files !== undefined && !Array.isArray(candidate.files)) {
    throw new Error('Upload files must be an array')
  }
}
