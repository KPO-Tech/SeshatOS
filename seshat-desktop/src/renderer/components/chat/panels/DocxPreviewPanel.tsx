import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { api, ApiError } from '@renderer/api/client'
import { clearPassageMarks, highlightPassageInElement } from '@renderer/lib/textPassageHighlight'

type Props = {
  fileId: string
  filename: string
  // The passage to mark and bring into view.
  highlight?: { text: string; pages: number[] }
}

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

const SCROLL_PADDING = 0 // keep in sync with .docx-preview-scroll's padding below

// Renders a .docx file's real content directly in the browser. docx-preview
// parses the document XML client-side, which keeps the default preview path
// local to the renderer and avoids server-side document rendering.
export function DocxPreviewPanel({ fileId, filename, highlight }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The page's real width in CSS px, as docx-preview laid it out (its own
  // line-breaking is computed against this at render time, which is why an
  // earlier attempt to let the page reflow to the panel's width instead -
  // ignoreWidth:true - produced pathological one-character-per-line text).
  // Fitting the panel is done by scaling the correctly-laid-out page
  // afterwards, the same idea as a document thumbnail.
  const naturalWidthRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const highlightRef = useRef(highlight)
  highlightRef.current = highlight

  // Marks the passage in the pages and brings it into view. A Word file has no fixed page to go to, so the passage is found by its words.
  function showPassage() {
    const container = containerRef.current
    if (!container) return
    clearPassageMarks(container)
    const wanted = highlightRef.current
    if (wanted) highlightPassageInElement(container, wanted.text)?.scrollIntoView({ block: 'center' })
  }

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')
    naturalWidthRef.current = 0

    function applyScale() {
      const scroll = scrollRef.current
      const container = containerRef.current
      const naturalWidth = naturalWidthRef.current
      if (!scroll || !container || naturalWidth <= 0) return
      const available = Math.max(1, scroll.clientWidth - SCROLL_PADDING * 2)
      const scale = available / naturalWidth
      // zoom (not transform) - it reflows, so the scroll container's
      // scrollable area and the flex-centering below both correctly follow
      // the scaled-down size instead of the page's real, unscaled one.
      container.style.width = `${naturalWidth}px`
      container.style.zoom = String(scale)
    }

    async function open() {
      if (!containerRef.current) return
      try {
        const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
        if (cancelled || !containerRef.current) return
        const buffer = base64ToArrayBuffer(dataUrl)
        containerRef.current.innerHTML = ''
        containerRef.current.style.width = ''
        containerRef.current.style.zoom = ''
        await renderAsync(buffer, containerRef.current, undefined, {
          inWrapper: true,
          ignoreHeight: true,
          className: 'docx-preview-doc',
        })
        if (cancelled || !containerRef.current) return
        // scrollWidth captures the true rendered content extent even
        // though the container's own CSS width is still "auto" here (no
        // zoom applied yet).
        naturalWidthRef.current = containerRef.current.scrollWidth
        applyScale()
        showPassage()
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to render document'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()

    const resizeObserver = new ResizeObserver(() => applyScale())
    if (scrollRef.current) resizeObserver.observe(scrollRef.current)

    return () => {
      cancelled = true
      resizeObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  // The document opened again at another passage.
  useEffect(() => {
    if (status === 'ready') showPassage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight])

  return (
    <div className="relative h-full min-h-0">
      <div className="docx-preview-scroll flex h-full items-start justify-center overflow-auto bg-white" ref={scrollRef}>
        <div className="docx-preview-container" ref={containerRef} />
      </div>
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-text-muted">Loading {filename}…</div>
      )}
      {status === 'error' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-error">Couldn't load this document: {errorMessage}</div>
      )}
    </div>
  )
}
