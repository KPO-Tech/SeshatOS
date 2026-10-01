import { useEffect, useState } from 'react'

type Props = {
  artifactId: string
  filename: string
}

// Renders an agent-written, self-contained HTML file as a live, interactive
// preview - sandbox="allow-scripts" WITHOUT allow-same-origin gives the
// iframe a unique opaque origin with no access to this app's window, DOM,
// IPC bridge, cookies, or localStorage, regardless of what the previewed
// page's own script does. The backend's /artifacts/preview/{id} endpoint
// (not this app's own file-serving) carries its own, separately-scoped CSP
// that allows the inline <script>/<style> a real HTML artifact needs - see
// artifactPreviewCSP in seshat-backend/internal/api/artifacts.go and the
// frame-src carve-out in seshat-ui/src/main/content-security-policy.ts.
export function ArtifactPreviewPanel({ artifactId, filename }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setError(null)
    window.nexus?.http?.backendOrigin()
      .then((origin) => {
        if (cancelled) return
        if (!origin) throw new Error('Backend origin unavailable')
        setSrc(`${origin}/api/v1/artifacts/preview/${artifactId}`)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to resolve preview URL')
      })
    return () => {
      cancelled = true
    }
  }, [artifactId])

  return (
    <div className="relative h-full min-h-0 bg-white">
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-error">Couldn't load preview: {error}</div>
      ) : src ? (
        <iframe
          src={src}
          title={filename}
          className="block h-full w-full border-0"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-text-muted">Loading preview…</div>
      )}
    </div>
  )
}
