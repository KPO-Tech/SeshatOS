export type MediaPayload = {
  image_base64?: string
  image_url?: string
  audio_base64?: string
  mime_type?: string
  content_type?: string
  revised_prompt?: string
  // present_artifact
  path?: string
  title?: string
  kind?: string
  video_id?: string
  size?: number
  summary?: string
}

// An answer stored by an earlier version may be wrapped in a note; the document is what lies between the first brace and the last.
export function parsePayload(content: string | undefined): MediaPayload | null {
  if (!content) return null
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(content.slice(start, end + 1)) as MediaPayload
  } catch {
    return null
  }
}

export function extensionFor(mime: string): string {
  const subtype = mime.split('/')[1]?.split(';')[0] ?? 'bin'
  return subtype === 'mpeg' ? 'mp3' : subtype === 'x-wav' ? 'wav' : subtype
}

export function formatBytes(size?: number): string {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
