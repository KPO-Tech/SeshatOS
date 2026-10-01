import { useEffect, useRef, useState } from 'react'
import { Reduce, Add, Left, Right, LoadingOne } from '@icon-park/react'
import { api, ApiError } from '@renderer/api/client'
import { loadPdfViewerModule, pdfjsLib } from '@renderer/lib/pdfInteractiveViewer'
import { createPDFWorkerPort } from '@renderer/lib/pdfWorker'
import 'pdfjs-dist/web/pdf_viewer.css'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  fileId: string
  filename: string
}

type LayoutMode = 'pages' | 'width'
type PdfViewerModule = Awaited<ReturnType<typeof loadPdfViewerModule>>
type PdfViewerInstance = InstanceType<PdfViewerModule['PDFViewer']>
type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>

const INITIAL_RANGE_CHUNK = 65536
const FULL_LOAD_LIMIT = 16 * 1024 * 1024
const PDF_OPEN_TIMEOUT_MS = 20_000

type FileMetadata = {
  size?: number
}

function dataURLToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

async function loadPDFDocument(
  params: Parameters<typeof pdfjsLib.getDocument>[0],
  label: string,
): Promise<PdfDocument> {
  const task = pdfjsLib.getDocument(params)
  try {
    return await withTimeout(task.promise, PDF_OPEN_TIMEOUT_MS, label)
  } catch (err) {
    void task.destroy().catch(() => {})
    throw err
  }
}

function applyPDFLayout(
  viewer: PdfViewerInstance | null,
  modes: Pick<PdfViewerModule, 'ScrollMode' | 'SpreadMode'> | null,
  mode: LayoutMode,
) {
  if (!viewer || !modes) return
  if (mode === 'pages') {
    viewer.spreadMode = modes.SpreadMode.NONE
    viewer.scrollMode = modes.ScrollMode.WRAPPED
    viewer.currentScaleValue = 'page-fit'
    return
  }
  viewer.spreadMode = modes.SpreadMode.NONE
  viewer.scrollMode = modes.ScrollMode.VERTICAL
  viewer.currentScaleValue = 'page-width'
}

// A real pdf.js viewer embed (scrollable, multi-page, selectable text/
// annotations via PDFViewer's own text/annotation layers) - not the
// thumbnail-only rasterization lib/pdfPreview.ts does for attachment cards.
// PDFViewer/PDFLinkService/EventBus are pdf.js's own building blocks for
// exactly this: embedding the viewer without pulling in its full generic
// web app (toolbar chrome, l10n, etc.) - this component supplies its own
// minimal toolbar instead.
export function PDFViewerPanel({ fileId, filename }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const pdfViewerRef = useRef<PdfViewerInstance | null>(null)
  const pdfModesRef = useRef<Pick<PdfViewerModule, 'ScrollMode' | 'SpreadMode'> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [scalePercent, setScalePercent] = useState(100)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('pages')

  useEffect(() => {
    let cancelled = false
    let pdfDocument: PdfDocument | null = null
    let pdfWorker: InstanceType<typeof pdfjsLib.PDFWorker> | null = null
    let eventBus: InstanceType<Awaited<ReturnType<typeof loadPdfViewerModule>>['EventBus']> | null = null

    async function open() {
      if (!containerRef.current || !viewerRef.current) return
      try {
        pdfWorker = pdfjsLib.PDFWorker.create({
          name: `seshat-pdf-viewer-${fileId}`,
          port: createPDFWorkerPort(),
        })
        const { PDFViewer, PDFLinkService, EventBus, ScrollMode, SpreadMode } = await loadPdfViewerModule()
        if (cancelled) return

        pdfModesRef.current = { ScrollMode, SpreadMode }
        eventBus = new EventBus()
        const linkService = new PDFLinkService({ eventBus })
        const pdfViewer = new PDFViewer({
          container: containerRef.current,
          viewer: viewerRef.current,
          eventBus,
          linkService,
          textLayerMode: 2,
          annotationMode: 2,
        })
        linkService.setViewer(pdfViewer)
        pdfViewerRef.current = pdfViewer

        eventBus.on('pagesinit', () => {
          if (cancelled) return
          applyPDFLayout(pdfViewer, pdfModesRef.current, layoutMode)
        })
        eventBus.on('scalechanging', (e: { scale: number }) => {
          if (!cancelled) setScalePercent(Math.round(e.scale * 100))
        })
        eventBus.on('pagechanging', (e: { pageNumber: number }) => {
          if (!cancelled) setPageNumber(e.pageNumber)
        })

        const metadata = await withTimeout(api.get<FileMetadata>(`/files/${fileId}`), PDF_OPEN_TIMEOUT_MS, 'PDF metadata')
        if (cancelled) return

        const path = `/files/${fileId}/content`
        if (!metadata.size || metadata.size <= FULL_LOAD_LIMIT) {
          const dataUrl = await withTimeout(api.getFileDataURL(path), PDF_OPEN_TIMEOUT_MS, 'PDF download')
          if (cancelled) return
          pdfDocument = await loadPDFDocument({ data: dataURLToBytes(dataUrl), worker: pdfWorker }, 'PDF render')
        } else {
          const initial = await withTimeout(
            api.getFileRange(path, 0, INITIAL_RANGE_CHUNK - 1),
            PDF_OPEN_TIMEOUT_MS,
            'PDF range download',
          )
          if (cancelled) return
          const transport = new pdfjsLib.PDFDataRangeTransport(
            initial.totalLength,
            new Uint8Array(initial.data),
            true,
            filename,
          )
          transport.requestDataRange = (begin: number, end: number) => {
            void (async () => {
              try {
                const chunk = await api.getFileRange(path, begin, end - 1)
                if (cancelled) return
                transport.onDataRange(begin, new Uint8Array(chunk.data))
              } catch (err) {
                if (cancelled) return
                const message =
                  err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load PDF range'
                setErrorMessage(message)
                setStatus('error')
              }
            })()
          }
          pdfDocument = await loadPDFDocument({ range: transport, worker: pdfWorker }, 'PDF range render')
        }
        if (cancelled) {
          void pdfDocument.destroy()
          pdfWorker.destroy()
          return
        }
        pdfViewer.setDocument(pdfDocument)
        linkService.setDocument(pdfDocument, null)
        setPageCount(pdfDocument.numPages)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load PDF'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
      pdfViewerRef.current = null
      pdfModesRef.current = null
      void pdfDocument?.destroy().finally(() => pdfWorker?.destroy())
      if (!pdfDocument) pdfWorker?.destroy()
    }
    // Re-open from scratch if the viewed file changes; loadPdfViewerModule/
    // pdfjsLib are stable module-level singletons, not real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  function setLayout(mode: LayoutMode) {
    setLayoutMode(mode)
    applyPDFLayout(pdfViewerRef.current, pdfModesRef.current, mode)
  }

  function zoomBy(factor: number) {
    const viewer = pdfViewerRef.current
    if (!viewer) return
    viewer.currentScale = Math.max(0.25, Math.min(viewer.currentScale * factor, 5))
  }

  function goToPage(delta: number) {
    const viewer = pdfViewerRef.current
    if (!viewer) return
    viewer.currentPageNumber = Math.max(1, Math.min(viewer.currentPageNumber + delta, pageCount))
  }

  const toolbarBtnCx = (active?: boolean) => cx(
    'flex size-[22px] items-center justify-center rounded-md border border-app-border-subtle bg-app-surface p-0 text-app-text-secondary enabled:cursor-pointer enabled:hover:bg-[var(--color-hover)] enabled:hover:text-app-text disabled:cursor-default disabled:opacity-40',
    active && '!border-[rgba(255,122,24,0.45)] !bg-[rgba(255,122,24,0.16)] !text-[var(--color-accent)]',
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-app-border-subtle px-2.5 py-1.5">
        <button type="button" className={toolbarBtnCx()} onClick={() => goToPage(-1)} disabled={status !== 'ready' || pageNumber <= 1} aria-label="Previous page">
          <Left size={12} />
        </button>
        <span className="min-w-[44px] text-center text-[11px] text-app-text-secondary">{status === 'ready' ? `${pageNumber} / ${pageCount}` : '—'}</span>
        <button type="button" className={toolbarBtnCx()} onClick={() => goToPage(1)} disabled={status !== 'ready' || pageNumber >= pageCount} aria-label="Next page">
          <Right size={12} />
        </button>
        <span className="flex-1" />
        <div className="flex items-center gap-0.5 rounded-[7px] border border-app-border-subtle bg-app-surface p-0.5" aria-label="PDF layout">
          <button
            type="button"
            className={cx('h-5 min-w-[48px] rounded-[5px] border-0 bg-transparent px-2 text-[11px] text-app-text-secondary', layoutMode === 'pages' && '!bg-[rgba(255,122,24,0.16)] !text-[var(--color-accent)]')}
            onClick={() => setLayout('pages')}
            disabled={status !== 'ready'}
          >
            Pages
          </button>
          <button
            type="button"
            className={cx('h-5 min-w-[48px] rounded-[5px] border-0 bg-transparent px-2 text-[11px] text-app-text-secondary', layoutMode === 'width' && '!bg-[rgba(255,122,24,0.16)] !text-[var(--color-accent)]')}
            onClick={() => setLayout('width')}
            disabled={status !== 'ready'}
          >
            Width
          </button>
        </div>
        <button type="button" className={toolbarBtnCx()} onClick={() => zoomBy(1 / 1.15)} disabled={status !== 'ready'} aria-label="Zoom out">
          <Reduce size={12} />
        </button>
        <span className="min-w-[44px] text-center text-[11px] text-app-text-secondary">{status === 'ready' ? `${scalePercent}%` : '—'}</span>
        <button type="button" className={toolbarBtnCx()} onClick={() => zoomBy(1.15)} disabled={status !== 'ready'} aria-label="Zoom in">
          <Add size={12} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="pdf-viewer-container absolute inset-0 overflow-auto bg-app-surface-elevated" ref={containerRef}>
          <div className="pdfViewer" ref={viewerRef} />
        </div>
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-[12px] text-app-text-secondary">
            <LoadingOne size={20} className="animate-[spin_1s_linear_infinite]" />
            <span>Loading {filename}...</span>
          </div>
        )}
        {status === 'error' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-[12px] text-app-error">Couldn't load this PDF: {errorMessage}</div>
        )}
      </div>
    </div>
  )
}
