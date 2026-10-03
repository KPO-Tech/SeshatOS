import { useEffect, useState } from 'react'
import { LoadingOne } from '@icon-park/react'
import { api } from '@renderer/api/client'
import { AttachmentTypeIcon } from '@renderer/components/AttachmentTypeIcon'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'
import { useUIStore } from '@renderer/stores/ui'
import type { ChatAttachment } from './attachmentTypes'
import { attachmentPreviewURL, fetchAttachmentTextPreview, isImageAttachment, isPDFAttachment, resolveAttachmentOpenAction } from './attachmentPreview'
import { renderPDFPagePreviews } from '@renderer/lib/pdfPreview'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const THUMB_CSS = 'relative flex h-full w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-app-md border bg-app-surface p-1 text-app-text-secondary cursor-pointer'

function borderClassFor(file: ChatAttachment): string {
  if (isImageAttachment(file)) return 'border-[color-mix(in_srgb,var(--accent-primary)_34%,transparent)]'
  if (file.category === 'documents') return 'border-[color-mix(in_srgb,var(--accent-success)_32%,transparent)]'
  return 'border-app-border-subtle'
}

function formatSize(size?: number): string | null {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  file: ChatAttachment
  size?: number
  onRemove?: (id: string) => void
}

// The one place an attachment's compact tile is rendered - reused by the
// composer (before sending, with onRemove) and by a sent message (after
// sending, read-only). Only two visual cases: a real image (or a PDF's
// page-1 render, both arrive via the same preview URL) shows as-is; anything
// else is an icon + filename, no extension badge, no unreadable text
// snippet - clicking it opens the right kind of full preview instead.
export function AttachmentThumb({ file, size = 56, onRemove }: Props) {
  const openLightbox = useUIStore((s) => s.openLightbox)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const [hydratedURL, setHydratedURL] = useState<string | undefined>()
  const isImage = isImageAttachment(file)
  const isPDF = isPDFAttachment(file)
  const previewURL = attachmentPreviewURL(file, hydratedURL)

  // Image attachments carry a client-only blob:/data: URL created at attach
  // time - it stops resolving the moment that renderer process exits, so
  // after a full app restart preview_url is undefined for every image in a
  // reloaded conversation even though the original bytes are still safely on
  // the server. Rehydrate a fresh data: URL from the file-content endpoint in
  // that case instead of falling back to the generic file icon.
  useEffect(() => {
    if (!isImage || previewURL || file.upload_status === 'uploading') return
    let cancelled = false
    void (async () => {
      try {
        const url = file.local_path && window.nexus?.readFileDataURL
          ? await window.nexus.readFileDataURL(file.local_path)
          : await api.getFileDataURL(`/files/${file.id}/content`)
        if (!cancelled) setHydratedURL(url)
      } catch {
        // Best-effort - leave the icon fallback in place.
      }
    })()
    return () => { cancelled = true }
  }, [isImage, previewURL, file.id, file.local_path, file.upload_status])

  // Same restart problem as images above, but a PDF's page-1 render
  // (page_preview_urls[0]) was never a blob: URL in the first place - it's
  // only missing after a restart because metadata.attachments on a reloaded
  // historical message doesn't carry it. Re-render page 1 client-side from
  // the server-persisted original bytes instead of falling back to the
  // generic file icon (previously the only attachment type this rehydration
  // covered was images).
  useEffect(() => {
    if (!isPDF || previewURL || file.upload_status === 'uploading') return
    let cancelled = false
    void (async () => {
      try {
        const dataUrl = file.local_path && window.nexus?.readFileDataURL
          ? await window.nexus.readFileDataURL(file.local_path)
          : await api.getFileDataURL(`/files/${file.id}/content`)
        const blob = await fetch(dataUrl).then((res) => res.blob())
        const [firstPage] = await renderPDFPagePreviews(blob, 1)
        if (!cancelled && firstPage) setHydratedURL(firstPage.dataURL)
      } catch {
        // Best-effort - leave the icon fallback in place.
      }
    })()
    return () => { cancelled = true }
  }, [isPDF, previewURL, file.id, file.local_path, file.upload_status])

  const isUploading = file.upload_status === 'uploading'
  const isFailed = file.upload_status === 'failed'
  const sizeLabel = formatSize(file.size)
  const statusLabel = isUploading ? 'Uploading...' : isFailed ? file.error || 'Upload failed' : sizeLabel
  const tooltip = [file.filename, statusLabel].filter(Boolean).join(' - ')

  async function handleOpen() {
    const action = resolveAttachmentOpenAction(file, previewURL)
    if (action.kind === 'lightbox') {
      openLightbox({ url: action.url, filename: file.filename })
    } else if (action.kind === 'panel') {
      openRightPanel({ kind: action.panel, title: file.filename, documentFileId: file.id })
    } else if (action.kind === 'text') {
      const text = await fetchAttachmentTextPreview(file).catch(() => null)
      if (text) {
        openRightPanel({ kind: 'markdown', title: file.filename, markdown: text.markdown, documentFileId: file.id, plainText: text.plainText })
      } else if (file.local_path) {
        void window.nexus?.openPath?.(file.local_path)
      }
    } else if (action.kind === 'external' && file.local_path) {
      void window.nexus?.openPath?.(file.local_path)
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        className={cx(
          THUMB_CSS,
          borderClassFor(file),
          isUploading && 'opacity-60',
          isFailed && 'border-[rgba(var(--color-error-rgb),0.5)]'
        )}
        onClick={() => void handleOpen()}
        aria-label={tooltip || file.filename}
      >
        {previewURL ? (
          <img className="absolute inset-0 h-full w-full object-cover" src={previewURL} alt={file.filename} />
        ) : (
          <>
            <AttachmentTypeIcon filename={file.filename} size={18} />
            <span className="w-full truncate text-center text-[7px] leading-[1.15] text-app-text-muted">{file.filename}</span>
          </>
        )}
        {isUploading && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.25)] text-white">
            <LoadingOne size={14} className="animate-[spin_0.9s_linear_infinite]" />
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          className="absolute -right-1.5 -top-1.5 z-[2] flex size-4 items-center justify-center rounded-full border border-app-border-subtle bg-app-surface p-0 text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text-secondary"
          onMouseDown={(e) => { e.preventDefault(); onRemove(file.id) }}
          aria-label="Remove attachment"
        >
          <WindowCloseIcon size={10} />
        </button>
      )}
    </div>
  )
}
