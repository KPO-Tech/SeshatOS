import { fetchAttachmentTextPreview, resolveAttachmentOpenAction } from '@renderer/components/chat/attachments/attachmentPreview'
import type { ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'
import { useUIStore } from '@renderer/stores/ui'
import type { CollectionFile } from './collectionsApi'

/** The name of a document without the folders it is in: "Legal/Contracts/a.pdf" is shown as "a.pdf". */
export function baseName(name: string): string {
  return name.split(/[\\/]/).filter(Boolean).pop() ?? name
}

/**
 * Opens a document of a collection in the right panel, with the viewers the chat uses (PDF, Word, Excel, PowerPoint, text and Markdown).
 * Returns false when there is no viewer for this kind of file, so the caller can say so.
 */
export async function openDocument(file: CollectionFile, corpusId: string): Promise<boolean> {
  const attachment: ChatAttachment = { id: file.fileId, filename: baseName(file.name), upload_status: 'uploaded' }
  const action = resolveAttachmentOpenAction(attachment, undefined)
  const { openRightPanel } = useUIStore.getState()
  const indexSource = { corpusId, fileId: file.fileId }
  if (action.kind === 'panel') {
    openRightPanel({ kind: action.panel, title: attachment.filename, documentFileId: file.fileId, indexSource })
    return true
  }
  if (action.kind === 'text') {
    const text = await fetchAttachmentTextPreview(attachment)
    if (!text) return false
    openRightPanel({ kind: 'markdown', title: attachment.filename, markdown: text.markdown, documentFileId: file.fileId, plainText: text.plainText, indexSource })
    return true
  }
  return false
}
