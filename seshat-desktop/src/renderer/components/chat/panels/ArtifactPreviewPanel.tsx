import { useEffect, useState } from 'react'
import { Refresh } from '@icon-park/react'
import { api } from '@renderer/api/client'
import { CodeBox } from '@renderer/components/chat/tools/common'
import { dataURLText } from '@renderer/lib/htmlArtifact'

type Props = {
  sessionId: string
  path: string
  filename: string
}

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; html: string; previewId: string }
  | { state: 'failed'; message: string }

type Tab = 'preview' | 'code'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Shows a web page the agent made, live. The file is read from the session's folders on disk (GET /sessions/{id}/artifact, which refuses
// anything outside them) each time the panel opens or reloads, then handed to the backend's preview store, whose page carries its own CSP:
// inline script and style run, nothing reaches the network - see artifactPreviewCSP in seshat-backend/internal/api/artifacts.go and the
// frame-src carve-out in src/main/content-security-policy.ts. sandbox="allow-scripts" WITHOUT allow-same-origin gives the frame a unique
// opaque origin with no access to this app's window, DOM, IPC bridge, cookies or localStorage, whatever the page's own script does.
export function ArtifactPreviewPanel({ sessionId, path, filename }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [origin, setOrigin] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('preview')
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let cancelled = false
    window.seshat?.http?.backendOrigin()
      .then((value) => { if (!cancelled) setOrigin(value || null) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoaded({ state: 'loading' })
    api.getFileDataURL(`/sessions/${sessionId}/artifact?path=${encodeURIComponent(path)}`)
      .then(async (url) => {
        const html = dataURLText(url)
        const { id } = await api.post<{ id: string }>('/artifacts/preview', { html })
        if (!cancelled) setLoaded({ state: 'ready', html, previewId: id })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ state: 'failed', message: error instanceof Error ? error.message : 'The page could not be loaded.' })
      })
    return () => { cancelled = true }
  }, [sessionId, path, reloads])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-app-border-subtle px-2 py-1.5">
        {(['preview', 'code'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cx(
              'cursor-pointer rounded-md border-0 px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
              tab === value ? 'bg-[var(--surface-hover)] text-app-text' : 'bg-transparent text-app-text-muted hover:text-app-text-secondary',
            )}
          >
            {value === 'preview' ? 'Preview' : 'Code'}
          </button>
        ))}
        <span className="min-w-0 flex-1 truncate px-2 text-[11px] text-app-text-muted" title={path}>{path}</span>
        <button
          type="button"
          onClick={() => setReloads((value) => value + 1)}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text"
          aria-label="Reload"
          title="Reload"
        >
          <Refresh size={12} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {loaded.state === 'failed' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-error">Couldn't load the page: {loaded.message}</div>
        ) : loaded.state === 'loading' || !origin ? (
          <div className="absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-text-muted">Loading the page…</div>
        ) : tab === 'code' ? (
          <div className="absolute inset-0 overflow-auto">
            <CodeBox content={loaded.html} copyable language="markup" lineNumbers bare expanded />
          </div>
        ) : (
          <iframe
            key={loaded.previewId}
            src={`${origin}/api/v1/artifacts/preview/${loaded.previewId}`}
            title={filename}
            className="block h-full w-full border-0 bg-white"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  )
}
