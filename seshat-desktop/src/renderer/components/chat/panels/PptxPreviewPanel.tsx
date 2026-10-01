import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@renderer/api/client'

type Props = {
  fileId: string
  filename: string
}

type PptxPreviewer = {
  preview: (data: ArrayBuffer) => unknown
}

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

function fitPresentationSize(host: HTMLElement): { width: number; height: number } {
  const availableWidth = Math.max(1, host.clientWidth - 24)
  const width = Math.max(640, availableWidth)
  return { width, height: Math.round(width * 9 / 16) }
}

// Renders .pptx in-browser through pptx-preview. The package is intentionally
// isolated here so we can swap it later without changing attachment routing
// or right-panel state.
export function PptxPreviewPanel({ fileId, filename }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')

    async function open() {
      const scroll = scrollRef.current
      const container = containerRef.current
      if (!scroll || !container) return

      try {
        container.innerHTML = ''
        const [{ init }, dataUrl] = await Promise.all([
          import('pptx-preview'),
          api.getFileDataURL(`/files/${fileId}/content`),
        ])
        if (cancelled || !containerRef.current || !scrollRef.current) return
        const { width, height } = fitPresentationSize(scrollRef.current)
        const previewer = init(containerRef.current, { width, height, mode: 'list' }) as PptxPreviewer
        await Promise.resolve(previewer.preview(base64ToArrayBuffer(dataUrl)))
        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to render presentation'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [fileId])

  return (
    <div className="relative h-full min-h-0">
      <div className="h-full overflow-auto bg-app-surface p-3" ref={scrollRef}>
        <div className="min-w-max [&>*]:mx-auto" ref={containerRef} />
      </div>
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-text-muted">Loading {filename}...</div>
      )}
      {status === 'error' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-error">Couldn't load this presentation: {errorMessage}</div>
      )}
    </div>
  )
}
