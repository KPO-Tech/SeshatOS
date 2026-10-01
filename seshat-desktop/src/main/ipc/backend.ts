import { randomUUID, randomBytes } from 'crypto'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { desktopBridgeProof, ensureDesktopBridgeSecret, resolveBackendOrigin } from '../runtime'
import { deleteSecret, getSecret, setSecret } from './secure-store'
import { assertTrustedSender } from './trusted-sender'
import { assertUploadPayloadShape, normalizeAPIPath } from './validation'
import { isRetryableNetworkError } from './network-errors'

type AuthUser = {
  id: string
  email: string
  display_name: string
  status: string
}

type StoredSession = {
  token: string
  user: AuthUser
  roles: string[]
}

type AuthMeResponse = {
  user?: AuthUser
  roles?: string[]
}

type RequestPayload = {
  path: string
  method?: string
  body?: unknown
}

type UploadPayload = {
  path: string
  fields?: Array<{ name: string; value: string }>
  files?: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }>
}

type StreamStartPayload = {
  path: string
  method?: string
  body?: unknown
}

type StreamEventMessage = {
  streamId: string
  name: string
  data: Record<string, unknown>
}

const AUTH_SESSION_KEY = 'auth-session'
const STREAM_EVENT_CHANNEL = 'http:stream:event'
const activeStreams = new Map<string, { controller: AbortController; webContentsId: number }>()
let cachedSession: StoredSession | null = null
let backendTrustPromise: Promise<void> | null = null

function buildBackendURL(path: string) {
  const normalized = normalizeAPIPath(path)
  return `${resolveBackendOrigin()}/api/v1${normalized}`
}

export async function ensureBackendTrusted() {
  if (backendTrustPromise) {
    return backendTrustPromise
  }
  backendTrustPromise = (async () => {
    const secret = await ensureDesktopBridgeSecret()
    const nonce = randomBytes(32).toString('hex')
    const url = new URL(`${resolveBackendOrigin()}/api/v1/desktop/handshake`)
    url.searchParams.set('nonce', nonce)

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Unable to authenticate the local backend (${res.status}): ${text || res.statusText}`)
    }

    const body = await res.json() as { algorithm?: string; proof?: string }
    const expected = desktopBridgeProof(secret, nonce)
    if (body.algorithm !== 'hmac-sha256' || body.proof !== expected) {
      throw new Error('Backend trust handshake failed. Check that seshat-ai backend uses the same SESHAT_RUNTIME_ROOT as the desktop app.')
    }
  })()

  try {
    await backendTrustPromise
  } catch (error) {
    backendTrustPromise = null
    throw error
  }
}

async function loadSession(): Promise<StoredSession | null> {
  if (cachedSession) {
    return cachedSession
  }
  const raw = await getSecret(AUTH_SESSION_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.token || !parsed?.user) {
      return null
    }
    cachedSession = parsed
    return parsed
  } catch {
    return null
  }
}

// Used by terminal-relay.ts to authenticate its own WebSocket connection to
// /api/v1/terminal/ws/:sessionId the same way every HTTP call from this
// process already does - reuses loadSession's caching/parsing instead of a
// second copy of it.
export async function getStoredAuthToken(): Promise<string | null> {
  const session = await loadSession()
  return session?.token ?? null
}

async function saveSession(session: StoredSession) {
  cachedSession = session
  await setSecret(AUTH_SESSION_KEY, JSON.stringify(session))
}

async function clearSession() {
  cachedSession = null
  await deleteSecret(AUTH_SESSION_KEY)
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  let payload: Awaited<ReturnType<typeof performJSONRequest>>
  try {
    payload = await performJSONRequest('/auth/me', 'GET', undefined, session.token)
  } catch {
    return session
  }
  if (payload.ok) {
    const data = payload.data as AuthMeResponse | undefined
    const refreshed = {
      token: session.token,
      user: data?.user ?? session.user,
      roles: data?.roles ?? session.roles,
    }
    await saveSession(refreshed)
    return refreshed
  }

  if (payload.status === 401 || payload.status === 403) {
    await clearSession()
    return null
  }

  return session
}

function sessionView(session: StoredSession | null) {
  if (!session) return null
  return {
    user: session.user,
    roles: session.roles,
    isAuthenticated: true,
  }
}

async function parseResponse(res: Response) {
  const text = await res.text().catch(() => '')
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return {
        ok: res.ok,
        status: res.status,
        data: text ? JSON.parse(text) : undefined,
        text,
      }
    } catch {
      return { ok: res.ok, status: res.status, text }
    }
  }
  return { ok: res.ok, status: res.status, text }
}

function extractErrorMessage(payload: { status: number; data?: any; text?: string }) {
  if (payload.data && typeof payload.data === 'object') {
    if (typeof payload.data.error === 'string' && payload.data.error.trim()) return payload.data.error
    if (typeof payload.data.message === 'string' && payload.data.message.trim()) return payload.data.message
  }
  return payload.text || `HTTP ${payload.status}`
}

async function performJSONRequest(path: string, method: string, body: unknown, token?: string) {
  await ensureBackendTrusted()
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  let requestBody: string | undefined
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(buildBackendURL(path), {
    method,
    headers,
    body: requestBody,
  })
  const payload = await parseResponse(res)
  if (res.status === 401) {
    await clearSession()
  }
  return payload
}

async function performUploadRequest(path: string, payload: UploadPayload, token?: string) {
  await ensureBackendTrusted()
  assertUploadPayloadShape(payload)
  const form = new FormData()
  for (const field of payload.fields ?? []) {
    form.append(field.name, field.value)
  }
  for (const file of payload.files ?? []) {
    form.append(file.name, new Blob([file.data], { type: file.mimeType || 'application/octet-stream' }), file.filename)
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(buildBackendURL(path), {
    method: 'POST',
    headers,
    body: form,
  })
  const parsed = await parseResponse(res)
  if (res.status === 401) {
    await clearSession()
  }
  return parsed
}

// Fetches a binary resource (e.g. GET /files/{id}/content) and returns it as
// a data: URL. Used to rehydrate attachment previews - the original bytes
// live in the blob store, addressable by file ID, regardless of whether the
// client-side blob:/data: URL generated at attach time is still valid (it
// stops being valid the moment the renderer process that created it exits).
async function performBinaryGetRequest(path: string, token?: string): Promise<{ ok: boolean; status: number; dataUrl?: string; error?: string }> {
  await ensureBackendTrusted()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(buildBackendURL(path), { method: 'GET', headers })
  if (!res.ok) {
    if (res.status === 401) {
      await clearSession()
    }
    return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) }
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { ok: true, status: res.status, dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` }
}

// Fetches one byte range of a file (e.g. GET /files/{id}/content with a
// Range header) and returns the raw bytes as an ArrayBuffer, never base64 -
// the whole point is avoiding both the 33% base64 bloat and having to wait
// for the complete file, so PDFViewerPanel's PDFDataRangeTransport can feed
// pdf.js small chunks as it asks for them instead of one big blob up front.
// totalLength comes from the response's Content-Range (e.g. "bytes 0-65535/
// 1222282") when the backend served a real 206 Partial Content; if it
// answered 200 instead (Range unsupported for this path, or ineligible file),
// this falls back to Content-Length so the caller still gets a usable length,
// just without the partial-content benefit for that request.
async function performFileRangeRequest(
  path: string,
  start: number,
  end: number,
  token?: string,
): Promise<{ ok: boolean; status: number; data?: ArrayBuffer; totalLength?: number; contentType?: string; error?: string }> {
  await ensureBackendTrusted()
  const headers: Record<string, string> = { Range: `bytes=${start}-${end}` }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(buildBackendURL(path), { method: 'GET', headers })
  if (!res.ok && res.status !== 206) {
    if (res.status === 401) {
      await clearSession()
    }
    return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) }
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const contentRange = res.headers.get('content-range')
  const totalMatch = contentRange ? /\/(\d+)$/.exec(contentRange) : null
  const totalLength = totalMatch ? Number(totalMatch[1]) : Number(res.headers.get('content-length') || 0)
  const data = await res.arrayBuffer()
  return { ok: true, status: res.status, data, totalLength, contentType }
}

async function startStream(
  event: IpcMainInvokeEvent,
  payload: StreamStartPayload,
  token?: string,
): Promise<{ streamId: string } | { error: string; retryable: boolean; unauthorized?: boolean }> {
  const controller = new AbortController()
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  // The trust handshake and the stream request are both real network calls —
  // either can fail purely because the backend isn't reachable yet (fresh
  // launch, backend still starting, temporary drop). That's a connectivity
  // failure the caller can retry, not an application error, so it's reported
  // as a value (see isRetryableNetworkError's doc comment) rather than thrown.
  let res: Response
  try {
    await ensureBackendTrusted()
    res = await fetch(buildBackendURL(payload.path), {
      method: payload.method || 'POST',
      headers,
      body: JSON.stringify(payload.body ?? {}),
      signal: controller.signal,
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to reach the backend',
      retryable: isRetryableNetworkError(error),
    }
  }
  if (!res.ok) {
    const parsed = await parseResponse(res)
    if (res.status === 401) {
      await clearSession()
      // Reported as a value, not a throw, specifically for 401: the renderer
      // needs to see this one (to also clear useAuthStore, which clearSession
      // above doesn't touch — that's main-process/OS-keychain state only) —
      // an ipcMain.handle throw only carries a message string across, losing
      // any way to distinguish "unauthorized" from any other stream-start
      // failure. Same reasoning as retryable network errors above.
      return { error: extractErrorMessage(parsed), retryable: false, unauthorized: true }
    }
    throw new Error(extractErrorMessage(parsed))
  }

  // Verify the SSE protocol version so we detect framing changes early.
  // The server sets X-SSE-Version on every streaming response (see query.go).
  const SSE_SUPPORTED_VERSION = '1'
  const sseVersion = res.headers.get('X-SSE-Version')
  if (sseVersion && sseVersion !== SSE_SUPPORTED_VERSION) {
    console.warn(`[backend] SSE protocol version mismatch: expected ${SSE_SUPPORTED_VERSION}, got ${sseVersion}. Streaming may be unreliable.`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const streamId = randomUUID()
  activeStreams.set(streamId, { controller, webContentsId: event.sender.id })

  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    let eventName = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim()
            continue
          }
          if (line === '') {
            eventName = ''
            continue
          }
          if (!line.startsWith('data: ')) continue

          const raw = line.slice(6).trim()
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(raw) as Record<string, unknown>
          } catch {
            continue
          }
          if (!event.sender.isDestroyed()) {
            event.sender.send(STREAM_EVENT_CHANNEL, {
              streamId,
              name: eventName || 'message',
              data: parsed,
            } satisfies StreamEventMessage)
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && !event.sender.isDestroyed()) {
        event.sender.send(STREAM_EVENT_CHANNEL, {
          streamId,
          name: 'error',
          data: {
            error: error instanceof Error ? error.message : 'Streaming failed',
            retryable: isRetryableNetworkError(error),
          },
        } satisfies StreamEventMessage)
      }
    } finally {
      activeStreams.delete(streamId)
      try {
        reader.releaseLock()
      } catch {
        // noop
      }
    }
  })()

  return { streamId }
}

// Authenticated backend call issued by the main process itself (not through
// the renderer IPC bridge) - reuses the same stored session/trust handshake
// as every renderer-originated call. Used by whisper-manager.ts to report
// the local whisper-server's status to seshat-backend once it's spawned.
export async function callBackendAsCurrentUser(path: string, method: string, body?: unknown) {
  const session = await loadSession()
  const payload = await performJSONRequest(path, method, body, session?.token)
  if (!payload.ok) {
    throw new Error(extractErrorMessage(payload))
  }
  return payload.data
}

export function registerBackendHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:login', async (event, credentials: { email: string; password: string }) => {
    assertTrustedSender(event)
    const payload = await performJSONRequest('/auth/login', 'POST', credentials)
    if (!payload.ok) {
      throw new Error(extractErrorMessage(payload))
    }
    const data = payload.data as { token: string; user: AuthUser; roles?: string[] }
    await saveSession({ token: data.token, user: data.user, roles: data.roles ?? [] })
    return sessionView(cachedSession)
  })

  ipcMain.handle('auth:register', async (event, registration: { name: string; email: string; password: string }) => {
    assertTrustedSender(event)
    const payload = await performJSONRequest('/auth/register', 'POST', registration)
    if (!payload.ok) {
      throw new Error(extractErrorMessage(payload))
    }
    const data = payload.data as { token: string; user: AuthUser; roles?: string[] }
    await saveSession({ token: data.token, user: data.user, roles: data.roles ?? [] })
    return sessionView(cachedSession)
  })

  ipcMain.handle('auth:logout', async (event) => {
    assertTrustedSender(event)
    const session = await loadSession()
    try {
      if (session?.token) {
        await performJSONRequest('/auth/logout', 'POST', undefined, session.token)
      }
    } finally {
      await clearSession()
    }
  })

  ipcMain.handle('auth:restore-session', async (event) => {
    assertTrustedSender(event)
    const session = await loadSession()
    if (!session) return null
    return sessionView(await refreshSession(session))
  })

  ipcMain.handle('auth:clear-session', async (event) => {
    assertTrustedSender(event)
    await clearSession()
  })

  ipcMain.handle('auth:update-user', async (event, user: AuthUser) => {
    assertTrustedSender(event)
    const session = await loadSession()
    if (!session) return null
    session.user = user
    await saveSession(session)
    return sessionView(session)
  })

  ipcMain.handle('http:request', async (event, payload: RequestPayload) => {
    assertTrustedSender(event)
    if (payload.path === '/auth/login' || payload.path === '/auth/register') {
      throw new Error('Use the dedicated auth bridge for login and registration')
    }
    const session = await loadSession()
    const parsed = await performJSONRequest(payload.path, payload.method || 'GET', payload.body, session?.token)
    return parsed
  })

  ipcMain.handle('http:upload', async (event, payload: UploadPayload) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return performUploadRequest(payload.path, payload, session?.token)
  })

  ipcMain.handle('http:file-content', async (event, path: string) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return performBinaryGetRequest(path, session?.token)
  })

  ipcMain.handle('http:file-range', async (event, payload: { path: string; start: number; end: number }) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return performFileRangeRequest(payload.path, payload.start, payload.end, session?.token)
  })

  // The artifact-preview <iframe> (see ArtifactPreviewPanel.tsx) navigates
  // directly - it can't go through the http:request IPC bridge like every
  // other backend call, since an <iframe src=...> is a real browser
  // navigation, not a fetch() this app controls. It still needs to know the
  // resolved origin (dynamic in a packaged app - the sidecar's actual port
  // isn't fixed) to build that URL, hence exposing it here instead of
  // hardcoding a default in the renderer.
  ipcMain.handle('http:backend-origin', (event) => {
    assertTrustedSender(event)
    return resolveBackendOrigin()
  })

  ipcMain.handle('http:stream:start', async (event, payload: StreamStartPayload) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return startStream(event, payload, session?.token)
  })

  ipcMain.handle('http:stream:cancel', async (event, streamId: string) => {
    assertTrustedSender(event)
    const active = activeStreams.get(streamId)
    if (!active || active.webContentsId !== event.sender.id) {
      return
    }
    active.controller.abort()
    activeStreams.delete(streamId)
  })
}
