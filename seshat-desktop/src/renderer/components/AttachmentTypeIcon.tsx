import type { ReactNode } from 'react'
import { FileWord, FileExcel, FilePpt, FilePdfOne, FileTextOne as FileGeneric, Pic } from '@icon-park/react'

// A file is told apart by its format before its name is read, the way the
// files page colours one: the icon carries the colour of the family.
const WORD = '#4a90e2'
const SHEET = '#3fae67'
const DECK = '#e0793a'
const PDF = '#d0524b'
const IMAGE = '#9b7bd6'
const OTHER = '#8a8f98'

// Shown in place of a real preview image for any non-image attachment (PDF
// page-1 renders are the only other "real preview" case - see
// attachments/attachmentPreview.ts) - a per-extension icon reads as "this is
// a file" instead of an empty/blank tile.
export function AttachmentTypeIcon({ filename, size = 20 }: { filename: string; size?: number }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const { color, icon } = appearance(ext, size)
  return <span style={{ color }}>{icon}</span>
}

function appearance(ext: string, size: number): { color: string; icon: ReactNode } {
  switch (ext) {
    case 'docx':
    case 'doc':
    case 'odt':
    case 'rtf':
      return { color: WORD, icon: <FileWord size={size} theme="filled" /> }
    case 'xlsx':
    case 'xls':
    case 'csv':
    case 'ods':
      return { color: SHEET, icon: <FileExcel size={size} theme="filled" /> }
    case 'pptx':
    case 'ppt':
    case 'odp':
    case 'key':
      return { color: DECK, icon: <FilePpt size={size} theme="filled" /> }
    case 'pdf':
      return { color: PDF, icon: <FilePdfOne size={size} theme="filled" /> }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'bmp':
    case 'heic':
      return { color: IMAGE, icon: <Pic size={size} theme="filled" /> }
    default:
      return { color: OTHER, icon: <FileGeneric size={size} theme="filled" /> }
  }
}
