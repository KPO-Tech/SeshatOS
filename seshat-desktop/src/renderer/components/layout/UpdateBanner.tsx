import { useEffect, useState } from 'react'

/**
 * Tells the person that a new version has been downloaded and lets them restart into it. The main process downloads updates in the
 * background but never installs one by itself (see main/auto-update.ts), so without this nothing would ever tell them it exists.
 */
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const updates = window.seshat?.updates
    if (!updates) return
    // The announcement is sent once, possibly before this window listened: ask for an update that is already downloaded.
    void updates.ready().then((payload) => { if (payload) setVersion(payload.version) }).catch(() => undefined)
    return updates.onDownloaded((payload) => {
      setVersion(payload.version)
      setDismissed(false)
    })
  }, [])

  if (!version || dismissed) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex max-w-[360px] items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 text-[13px] text-[var(--text-primary)] shadow-lg"
    >
      <span className="min-w-0 flex-1">SeshatOS {version} is ready. Restart to install it.</span>
      <button
        type="button"
        disabled={installing}
        onClick={() => {
          setInstalling(true)
          void window.seshat?.updates?.quitAndInstall()
        }}
        className="cursor-pointer rounded-md border-0 bg-[var(--accent-primary)] px-3 py-1 text-[12px] font-semibold text-white disabled:cursor-default disabled:opacity-60"
      >
        {installing ? 'Restarting…' : 'Restart and install'}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="cursor-pointer rounded-md border-0 bg-transparent px-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        Later
      </button>
    </div>
  )
}
