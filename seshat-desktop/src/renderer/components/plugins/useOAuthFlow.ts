import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 2000
const MAX_ATTEMPTS = 30

type Options = {
  // Returns the URL to open in the system browser.
  start: () => Promise<string>
  // Called every couple of seconds; return true once the new account shows up.
  isDone: () => Promise<boolean>
  onDone: () => void
}

// OAuth for a desktop app: open the provider's page in the system browser,
// then poll until the callback has created the account (or give up after a
// minute). Shared by every OAuth-based plugin source.
export function useOAuthFlow() {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setConnecting(false)
  }, [])

  useEffect(() => stop, [stop])

  const run = useCallback(async ({ start, isDone, onDone }: Options) => {
    setError(null)
    setConnecting(true)
    try {
      const url = await start()
      if (window.nexus?.openExternal) await window.nexus.openExternal(url)
      else window.open(url, '_blank', 'noopener,noreferrer')

      let attempts = 0
      if (timer.current) clearInterval(timer.current)
      timer.current = setInterval(async () => {
        attempts += 1
        let done = false
        try {
          done = await isDone()
        } catch {
          // Keep polling until the attempt budget runs out.
        }
        if (done) {
          stop()
          onDone()
        } else if (attempts >= MAX_ATTEMPTS) {
          stop()
        }
      }, POLL_INTERVAL_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the connection.')
      setConnecting(false)
    }
  }, [stop])

  return { connecting, error, run, cancel: stop }
}
