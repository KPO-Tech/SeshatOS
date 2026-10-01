import { useAuthStore } from '@renderer/stores/auth'
import type { StreamEvent } from '@renderer/api/types'
import type { DonePayload, RuntimeEventPayload, SessionTitledPayload } from './runtimeTypes'

export type RetryableError = Error & { retryable?: boolean }

function makeRetryableError(message: string, retryable: boolean): RetryableError {
  const error: RetryableError = new Error(message)
  error.retryable = retryable
  return error
}

export async function consumeElectronStream(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onDone: (payload: DonePayload) => void,
  onRuntime: (payload: RuntimeEventPayload) => void,
  onChunk: (payload: StreamEvent) => void,
  onSessionTitled: (payload: SessionTitledPayload) => void,
) {
  if (!window.nexus?.http) {
    throw new Error('Electron HTTP bridge is unavailable')
  }

  const startResult = await window.nexus.http.startStream({
    path: '/query/stream',
    method: 'POST',
    body,
  })
  if ('error' in startResult) {
    if (startResult.unauthorized) {
      useAuthStore.getState().logout()
    }
    throw makeRetryableError(startResult.error, startResult.retryable)
  }
  const { streamId } = startResult

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const unsubscribe = window.nexus.http!.onStreamEvent(streamId, ({ name, data }) => {
      if (settled) return
      if (name === 'error') {
        settled = true
        unsubscribe()
        cleanupAbort()
        reject(makeRetryableError((data.error as string) || 'Streaming error', data.retryable === true))
        return
      }
      if (name === 'done') {
        settled = true
        unsubscribe()
        cleanupAbort()
        onDone(data as DonePayload)
        resolve()
        return
      }
      if (name === 'runtime') {
        onRuntime(data as RuntimeEventPayload)
        return
      }
      if (name === 'session_titled') {
        onSessionTitled(data as SessionTitledPayload)
        return
      }
      onChunk(data as StreamEvent)
    })

    const onAbort = () => {
      if (settled) return
      settled = true
      unsubscribe()
      cleanupAbort()
      void window.nexus?.http?.cancelStream(streamId).catch(() => {
        // noop
      })
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const cleanupAbort = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })

    if (signal.aborted) {
      onAbort()
    }
  })
}

export async function consumeBrowserStream(
  body: Record<string, unknown>,
  token: string | null,
  signal: AbortSignal,
  onDone: (payload: DonePayload) => void,
  onRuntime: (payload: RuntimeEventPayload) => void,
  onChunk: (payload: StreamEvent) => void,
  onSessionTitled: (payload: SessionTitledPayload) => void,
) {
  const res = await fetch('http://127.0.0.1:8090/api/v1/query/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    let msg = errText || `HTTP ${res.status}`
    try {
      msg = (JSON.parse(errText) as { error?: string }).error ?? msg
    } catch {
      // noop
    }
    throw new Error(msg)
  }

  const SSE_SUPPORTED_VERSION = '1'
  const sseVersion = res.headers.get('X-SSE-Version')
  if (sseVersion && sseVersion !== SSE_SUPPORTED_VERSION) {
    throw new Error(`Unsupported SSE protocol version: expected ${SSE_SUPPORTED_VERSION}, got ${sseVersion}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const dec = new TextDecoder()
  let buf = ''
  let eventName = ''

  try {
    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

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

        if (eventName === 'error') {
          throw new Error((parsed.error as string) || 'Streaming error')
        }

        if (eventName === 'done') {
          onDone(parsed as DonePayload)
          break outer
        }

        if (eventName === 'session_titled') {
          onSessionTitled(parsed as SessionTitledPayload)
          continue
        }

        if (eventName === 'runtime') {
          onRuntime(parsed as RuntimeEventPayload)
          continue
        }

        onChunk(parsed as StreamEvent)
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // noop
    }
  }
}
