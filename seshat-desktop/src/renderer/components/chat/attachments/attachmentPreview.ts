import { api } from '@renderer/api/client'
import type { ChatAttachment } from './attachmentTypes'

export function isImageAttachment(file: Pick<ChatAttachment, 'category' | 'content_type'>): boolean {
  return file.category === 'images' || Boolean(file.content_type?.startsWith('image/'))
}

export function isPDFAttachment(file: Pick<ChatAttachment, 'content_type' | 'filename'>): boolean {
  return file.content_type === 'application/pdf' || fileExtension(file.filename) === 'pdf'
}

// page_preview_urls/preview_url are set once, client-side, at attach time
// (PDF page-1 render, or the browser's own blob: URL for an image) and
// persist as message metadata from then on. hydratedURL is a lazily-fetched
// fallback for when that client-only URL no longer resolves (e.g. after an
// app restart) - see AttachmentThumb's rehydration effect.
export function attachmentPreviewURL(file: ChatAttachment, hydratedURL?: string): string | undefined {
  return file.page_preview_urls?.[0] ?? file.preview_url ?? hydratedURL
}

function fileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

// Genuinely Markdown - safe to interpret headings/lists/etc as syntax.
const MD_EXTENSIONS = new Set(['md', 'markdown'])
// Plain text that shares the "preview raw bytes directly" fetch path with
// Markdown, but isn't Markdown - rendering these through MarkdownView would
// misinterpret incidental "#"/"-" characters as syntax.
const PLAIN_TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'log'])
const TEXT_PREVIEW_EXTENSIONS = new Set([...MD_EXTENSIONS, ...PLAIN_TEXT_EXTENSIONS])
// Files with no native panel and no readable raw bytes: the backend reads them to markdown when the
// preview is opened. DOCX, PPTX and XLSX have their own client-side render.
const MARKDOWN_CONVERTED_EXTENSIONS = new Set(['html', 'htm', 'tex', 'wav', 'mp3'])

export function isPlainTextFilename(filename: string): boolean {
  return PLAIN_TEXT_EXTENSIONS.has(fileExtension(filename))
}

function hasMarkdownPreview(file: ChatAttachment): boolean {
  return MARKDOWN_CONVERTED_EXTENSIONS.has(fileExtension(file.filename))
}

async function fetchTextContent(fileId: string, kind: 'direct' | 'markdown'): Promise<string> {
  const dataUrl = await api.getFileDataURL(`/files/${fileId}/${kind === 'direct' ? 'content' : 'markdown'}`)
  // Decode the base64 payload directly rather than fetch(dataUrl) - the
  // renderer's CSP connect-src doesn't (and shouldn't need to) allow data:,
  // and this avoids a pointless extra network-stack round-trip anyway.
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export type AttachmentOpenAction =
  | { kind: 'lightbox'; url: string }
  | { kind: 'panel'; panel: 'pdf' | 'docx' | 'xlsx' | 'pptx' }
  | { kind: 'text' }
  | { kind: 'external' }
  | { kind: 'none' }

// Decides what clicking an attachment should do. Deliberately knows nothing
// about useUIStore/right-panel wiring - the caller (AttachmentThumb) applies
// the action, which keeps this testable as a pure function.
export function resolveAttachmentOpenAction(file: ChatAttachment, previewURL: string | undefined): AttachmentOpenAction {
  if (file.upload_status === 'uploading' || file.upload_status === 'failed') return { kind: 'none' }
  if (isImageAttachment(file)) return previewURL ? { kind: 'lightbox', url: previewURL } : { kind: 'none' }
  const ext = fileExtension(file.filename)
  if (ext === 'pdf') return { kind: 'panel', panel: 'pdf' }
  if (ext === 'docx') return { kind: 'panel', panel: 'docx' }
  if (ext === 'xlsx') return { kind: 'panel', panel: 'xlsx' }
  if (ext === 'pptx') return { kind: 'panel', panel: 'pptx' }
  if (TEXT_PREVIEW_EXTENSIONS.has(ext) || hasMarkdownPreview(file)) return { kind: 'text' }
  if (file.local_path) return { kind: 'external' }
  return { kind: 'none' }
}

// Fetched lazily, only when the user actually clicks a { kind: 'text' }
// attachment - never eagerly for every attachment just to feed a thumbnail.
export async function fetchAttachmentTextPreview(file: ChatAttachment): Promise<{ markdown: string; plainText: boolean } | null> {
  const ext = fileExtension(file.filename)
  if (TEXT_PREVIEW_EXTENSIONS.has(ext)) {
    return { markdown: await fetchTextContent(file.id, 'direct'), plainText: isPlainTextFilename(file.filename) }
  }
  if (hasMarkdownPreview(file)) {
    return { markdown: await fetchTextContent(file.id, 'markdown'), plainText: false }
  }
  return null
}
