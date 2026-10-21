import { useCallback, useRef, useState } from 'react'
import { api } from '@renderer/api/client'
import { attachmentCategory, isPDFFile, MAX_UPLOAD_BYTES, oversizedMessage, sentAttachment, type ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'
import { renderPDFPagePreviews } from '@renderer/lib/pdfPreview'

type UploadedFileResponse = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
}

export function useDraftAttachments(sessionId?: string) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  // The upload response swaps an attachment's local-* id for its real server
  // id, which can land before renderPDFPagePreviews (rendering up to 10
  // pages client-side) resolves - a preview update keyed on the now-stale
  // local id would then match nothing and silently vanish. This tracks
  // local id -> current id so the preview callback can always find the
  // right attachment regardless of which finishes first.
  const idMapRef = useRef<Record<string, string>>({})

  const handleAttachFiles = useCallback(async (files: FileList) => {
    if (!files.length || !sessionId) return
    const selectedFiles = Array.from(files)
    const pending = selectedFiles.map((file, index): ChatAttachment => ({
      id: `local-${Date.now()}-${index}-${file.name}`,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      category: attachmentCategory(file),
      preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      upload_status: 'uploading',
    }))
    setAttachments(current => [...current, ...pending])
    for (const [index, file] of selectedFiles.entries()) {
      const pendingId = pending[index]?.id
      if (isPDFFile(file)) {
        void renderPDFPagePreviews(file, 10)
          .then((previews) => {
            const urls = previews.map((preview) => preview.dataURL)
            const currentId = (pendingId && idMapRef.current[pendingId]) || pendingId
            setAttachments(current => current.map(attachment => (
              attachment.id === currentId
                ? { ...attachment, preview_url: urls[0], page_preview_urls: urls }
                : attachment
            )))
          })
          .catch(() => {})
      }
    }
    setUploadingAttachments(true)
    setAttachmentError(null)
    const failures: string[] = []
    // One file that cannot be uploaded must not take the others down with it: each is sent on its own and marked on its own.
    for (const [index, file] of selectedFiles.entries()) {
      const pendingId = pending[index]?.id
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(oversizedMessage(file.name, file.size))
        const form = new FormData()
        form.append('file', file)
        const item = await api.upload<UploadedFileResponse>(`/sessions/${sessionId}/files`, form)
        if (pendingId) idMapRef.current[pendingId] = item.id
        setAttachments(current => current.map(attachment => (
          attachment.id === pendingId
            ? {
                ...attachment,
                id: item.id,
                filename: item.filename,
                content_type: item.content_type,
                size: item.size,
                category: item.category,
                local_path: item.local_path,
                page_preview_urls: attachment.page_preview_urls,
                preview_url: attachment.preview_url,
                upload_status: 'uploaded',
              }
            : attachment
        )))
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : 'Attachment upload failed.'
        failures.push(message)
        setAttachments(current => current.map(attachment => (
          attachment.id === pendingId ? { ...attachment, upload_status: 'failed', error: message } : attachment
        )))
      }
    }
    if (failures.length > 0) {
      setAttachmentError(failures.length === 1 ? `Attachment upload failed: ${failures[0]}` : `${failures.length} attachments failed to upload: ${failures[0]}`)
    }
    setUploadingAttachments(false)
  }, [sessionId])

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setAttachments(current => current.filter(file => file.id !== fileId))
    setAttachmentError(null)
    if (!fileId.startsWith('local-')) {
      void api.delete(`/files/${fileId}`).catch(() => {})
    }
  }, [])

  const hasUploadingAttachments = attachments.some(file => file.upload_status === 'uploading')
  const uploadedAttachments = attachments.filter(file => file.upload_status !== 'failed' && !file.id.startsWith('local-'))

  return {
    attachments,
    uploadingAttachments,
    attachmentError,
    setAttachmentError,
    clearAttachments: () => setAttachments([]),
    handleAttachFiles,
    handleRemoveAttachment,
    hasUploadingAttachments,
    uploadedFileIds: uploadedAttachments.map(file => file.id),
    sentAttachments: uploadedAttachments.map(sentAttachment),
  }
}
