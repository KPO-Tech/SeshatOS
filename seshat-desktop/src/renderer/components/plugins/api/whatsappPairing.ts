import { SESHAT_BASE } from '@renderer/api/client'
import { useAuthStore } from '@renderer/stores/auth'

export async function consumeWhatsAppPairStream(
  signal: AbortSignal,
  onQR: (code: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
) {
  try {
    if (window.nexus?.http) {
      const started = await window.nexus.http.startStream({ path: '/inbox/accounts/whatsapp/pair', method: 'POST' })
      if ('error' in started) {
        onError(started.error)
        return
      }
      const { streamId } = started
      await new Promise<void>((resolve) => {
        const unsubscribe = window.nexus.http!.onStreamEvent(streamId, ({ name, data }) => {
          if (name === 'qr' && typeof data.code === 'string') onQR(data.code)
          else if (name === 'done') {
            unsubscribe()
            onDone()
            resolve()
          } else if (name === 'error') {
            unsubscribe()
            onError(typeof data.error === 'string' ? data.error : 'Pairing failed.')
            resolve()
          }
        })
        signal.addEventListener('abort', () => {
          unsubscribe()
          void window.nexus?.http?.cancelStream(streamId).catch(() => {})
          resolve()
        })
      })
      return
    }

    const token = useAuthStore.getState().token
    const res = await fetch(`${SESHAT_BASE}/inbox/accounts/whatsapp/pair`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    })
    if (!res.ok || !res.body) {
      onError(`HTTP ${res.status}`)
      return
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let eventName = ''
    while (true) {
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
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(line.slice(6).trim())
        } catch {
          continue
        }
        if (eventName === 'qr' && typeof parsed.code === 'string') onQR(parsed.code)
        else if (eventName === 'done') {
          onDone()
          return
        } else if (eventName === 'error') {
          onError(typeof parsed.error === 'string' ? parsed.error : 'Pairing failed.')
          return
        }
      }
    }
  } catch (err) {
    if (signal.aborted) return
    onError(err instanceof Error ? err.message : 'Pairing failed.')
  }
}
