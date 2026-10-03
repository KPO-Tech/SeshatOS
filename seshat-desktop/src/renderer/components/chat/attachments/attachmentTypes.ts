// The one attachment shape, used both before a file is sent (composer drafts,
// where upload_status/error are meaningful) and after (persisted message
// metadata, where they're simply absent - every field below is optional, so
// both states satisfy this same type without a second near-duplicate one).
export type ChatAttachment = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
  preview_url?: string
  page_preview_urls?: string[]
  upload_status?: 'uploading' | 'uploaded' | 'failed'
  error?: string
}

export function attachmentCategory(file: File): ChatAttachment['category'] {
  if (file.type.startsWith('image/')) return 'images'
  if (
    file.type.includes('pdf') ||
    file.type.includes('document') ||
    file.type.includes('text') ||
    /\.(pdf|doc|docx|txt|md|csv|xls|xlsx|ppt|pptx)$/i.test(file.name)
  ) {
    return 'documents'
  }
  return 'other'
}

export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function sentAttachment(file: ChatAttachment) {
  return {
    id: file.id,
    filename: file.filename,
    content_type: file.content_type,
    size: file.size,
    category: file.category,
    local_path: file.local_path,
    preview_url: file.preview_url,
    page_preview_urls: file.page_preview_urls,
  }
}
