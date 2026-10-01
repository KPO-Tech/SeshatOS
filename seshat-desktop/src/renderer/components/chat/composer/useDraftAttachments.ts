import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from '@renderer/api/client'
import { attachmentCategory, isDocumentReadProcessing, isPDFFile, sentAttachment, type ChatAttachment, type DocumentReadStatus } from '@renderer/components/chat/attachments/attachmentTypes'
import { renderPDFPagePreviews } from '@renderer/lib/pdfPreview'

type UploadedFileResponse = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
  document_read_status?: DocumentReadStatus
  document_read_engine?: string
  document_read_pages?: number
  document_read_images?: number
  document_read_visual_pages?: number[]
}

const DOCUMENT_READ_POLL_DELAY_MS = 2000
const DOCUMENT_READ_POLL_ATTEMPTS = 900

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function useDraftAttachments(sessionId?: string) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

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
            setAttachments(current => current.map(attachment => (
              attachment.id === pendingId
                ? { ...attachment, preview_url: urls[0], page_preview_urls: urls }
                : attachment
            )))
          })
          .catch(() => {})
      }
    }
    setUploadingAttachments(true)
    setAttachmentError(null)
    try {
      for (const [index, file] of selectedFiles.entries()) {
        const pendingId = pending[index]?.id
        const form = new FormData()
        form.append('file', file)
        const item = await api.upload<UploadedFileResponse>(`/sessions/${sessionId}/files`, form)
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
                document_read_status: item.document_read_status,
                document_read_engine: item.document_read_engine,
                document_read_pages: item.document_read_pages,
                document_read_images: item.document_read_images,
                document_read_visual_pages: item.document_read_visual_pages,
                page_preview_urls: attachment.page_preview_urls,
                preview_url: attachment.preview_url,
                upload_status: 'uploaded',
              }
            : attachment
        )))
        if (item.document_read_status === 'processing') {
          void pollDocumentReadStatus(item.id, setAttachments)
        }
      }
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Attachment upload failed.'
      setAttachmentError(`Attachment upload failed: ${message}`)
      setAttachments(current => current.map(file => (
        pending.some(item => item.id === file.id)
          ? { ...file, upload_status: 'failed', error: message }
          : file
      )))
    } finally {
      setUploadingAttachments(false)
    }
  }, [sessionId])

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setAttachments(current => current.filter(file => file.id !== fileId))
    setAttachmentError(null)
    if (!fileId.startsWith('local-')) {
      void api.delete(`/files/${fileId}`).catch(() => {})
    }
  }, [])

  const hasUploadingAttachments = attachments.some(file => file.upload_status === 'uploading')
  const hasProcessingDocuments = attachments.some(isDocumentReadProcessing)
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
    hasProcessingDocuments,
    uploadedFileIds: uploadedAttachments.map(file => file.id),
    sentAttachments: uploadedAttachments.map(sentAttachment),
  }
}

async function pollDocumentReadStatus(
  fileId: string,
  setAttachments: Dispatch<SetStateAction<ChatAttachment[]>>
) {
  for (let attempt = 0; attempt < DOCUMENT_READ_POLL_ATTEMPTS; attempt += 1) {
    await wait(DOCUMENT_READ_POLL_DELAY_MS)
    try {
      const item = await api.get<UploadedFileResponse>(`/files/${fileId}`)
      setAttachments(current => current.map(attachment => (
        attachment.id === fileId
          ? {
              ...attachment,
              document_read_status: item.document_read_status,
              document_read_engine: item.document_read_engine,
              document_read_pages: item.document_read_pages,
              document_read_images: item.document_read_images,
              document_read_visual_pages: item.document_read_visual_pages,
              local_path: item.local_path ?? attachment.local_path,
            }
          : attachment
      )))
      if (item.document_read_status !== 'processing') return
    } catch {
      return
    }
  }
}
