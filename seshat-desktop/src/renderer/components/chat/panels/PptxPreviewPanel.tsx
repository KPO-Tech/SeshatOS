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

const PADDING = 24

// The presenter draws its slides inside a box of this size and scrolls them there, so the box is the whole free space of the panel:
// a box sized from the width alone (16:9) leaves the slides in a strip at the top with the rest empty.
function fitPresentationSize(host: HTMLElement): { width: number; height: number } {
  const width = Math.max(320, host.clientWidth - PADDING)
  const height = Math.max(240, host.clientHeight - PADDING)
  return { width, height }
}

// Renders .pptx in-browser through pptx-preview. The package is intentionally
// isolated here so we can swap it later without changing attachment routing
// or right-panel state.
export function PptxPreviewPanel({ fileId, filename }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [size, setSize] = useState({ width: 0, height: 0 })
  const dataRef = useRef<{ fileId: string; data: ArrayBuffer } | null>(null)

  // Drawn again when the panel changes size (dragged wider, maximized): the slides follow the space they have.
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const next = { width: Math.round(scroll.clientWidth), height: Math.round(scroll.clientHeight) }
        setSize((current) => (Math.abs(current.width - next.width) < 4 && Math.abs(current.height - next.height) < 4 ? current : next))
      }, 150)
    })
    observer.observe(scroll)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

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
        const cached = dataRef.current?.fileId === fileId ? dataRef.current.data : null
        const [{ init }, data] = await Promise.all([
          import('pptx-preview'),
          cached ?? api.getFileDataURL(`/files/${fileId}/content`).then(base64ToArrayBuffer),
        ])
        dataRef.current = { fileId, data }
        if (cancelled || !containerRef.current || !scrollRef.current) return
        const { width, height } = fitPresentationSize(scrollRef.current)
        const previewer = init(containerRef.current, { width, height, mode: 'list' }) as PptxPreviewer
        // preview() takes ownership of the buffer: it is given a copy so that drawing again at another size can start from the same bytes.
        await Promise.resolve(previewer.preview(data.slice(0)))
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
  }, [fileId, size.width, size.height])

  return (
    <div className="relative h-full min-h-0">
      <div className="h-full overflow-hidden bg-app-surface p-3" ref={scrollRef}>
        <div className="h-full [&>*]:mx-auto" ref={containerRef} />
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
