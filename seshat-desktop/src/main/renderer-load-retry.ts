const LOAD_RETRY_DELAYS_MS = [500, 1000, 2000]

/** How long the window stays hidden while the renderer loads before it is shown anyway. */
export const SHOW_FALLBACK_MS = 4000

/** How long a load may go without finishing before it counts as failed. */
export const LOAD_WATCHDOG_MS = 15000

type LoadRetryOptions = {
  load: () => void
  onGiveUp: () => void
  delaysMs?: number[]
}

/**
 * Retries a failed renderer load with a growing delay, then gives up. The first load can fail at startup when Chromium's network
 * service restarts, and a window that never loads is never shown (see ready-to-show in index.ts).
 */
export function createLoadRetry({ load, onGiveUp, delaysMs = LOAD_RETRY_DELAYS_MS }: LoadRetryOptions) {
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    failed() {
      if (timer) return
      if (attempt >= delaysMs.length) return onGiveUp()
      const delay = delaysMs[attempt++]
      timer = setTimeout(() => {
        timer = null
        load()
      }, delay)
    },
    /** Starts over, for a load the user asked for. */
    reset() {
      cancel()
      attempt = 0
    },
    cancel
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The address of the Retry link of the failure page; the main process intercepts it (will-navigate) and reloads. */
export const RETRY_URL = 'seshat-retry://reload'

/** The page shown when the renderer still fails to load after the retries. */
export function buildLoadFailureUrl(detail: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>SeshatOS</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#2f2e34;color:#e8e6e3;font:14px system-ui,sans-serif}
main{max-width:420px;padding:24px}h1{font-size:18px;margin:0 0 8px}p{margin:0 0 16px;color:#a8a5a0}
a{display:inline-block;padding:8px 16px;border-radius:6px;background:#e8e6e3;color:#2f2e34;text-decoration:none;font-weight:600}
</style></head><body><main><h1>SeshatOS could not load its window</h1><p>${escapeHtml(detail)}</p><a href="${RETRY_URL}">Retry</a></main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export const isRetryNavigation = (url: string) => url === RETRY_URL
