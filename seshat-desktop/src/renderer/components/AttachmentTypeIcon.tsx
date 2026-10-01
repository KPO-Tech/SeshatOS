import { FileWord, FileExcel, FilePpt, FilePdfOne, FileTextOne as FileGeneric } from '@icon-park/react'

// Shown in place of a real preview image for any non-image attachment (PDF
// page-1 renders are the only other "real preview" case - see
// attachments/attachmentPreview.ts) - a per-extension icon reads as "this is
// a file" instead of an empty/blank tile.
export function AttachmentTypeIcon({ filename, size = 20 }: { filename: string; size?: number }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'docx':
    case 'doc':
      return <FileWord size={size} />
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileExcel size={size} />
    case 'pptx':
    case 'ppt':
      return <FilePpt size={size} />
    case 'pdf':
      return <FilePdfOne size={size} />
    default:
      return <FileGeneric size={size} />
  }
}
