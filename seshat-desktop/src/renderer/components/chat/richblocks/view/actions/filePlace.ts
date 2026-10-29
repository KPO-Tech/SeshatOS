export type FilePlace = { where: 'panel' | 'system'; path: string }

// What the Files panel cannot show as text: these are handed to the system's own application.
const OPENED_BY_SYSTEM = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'heic', 'tiff',
  'mp3', 'wav', 'ogg', 'flac', 'mp4', 'mov', 'mkv', 'webm', 'avi',
  'zip', 'gz', 'tar', '7z', 'rar', 'exe', 'dll', 'bin', 'iso', 'dmg', 'sqlite', 'db', 'duckdb', 'parquet'
])

const isAbsolute = (path: string) => /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]/.test(path) || path.startsWith('~')

function join(folder: string, path: string): string {
  const sep = folder.includes('/') && !folder.includes('\\') ? '/' : '\\'
  const cleaned = path.replace(/^\.[\\/]/, '')
  return folder.endsWith('/') || folder.endsWith('\\') ? `${folder}${cleaned}` : `${folder}${sep}${cleaned}`
}

/** Where a file named by an answer opens: a text file in the Files panel, anything else with the system. A relative path is the project's. */
export function filePlace(path: string, projectPath?: string): FilePlace {
  const full = isAbsolute(path) || !projectPath ? path : join(projectPath, path)
  const extension = full.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? ''
  const hasExtension = /\.[^\\/.]+$/.test(full)
  return { where: hasExtension && OPENED_BY_SYSTEM.has(extension) ? 'system' : 'panel', path: full }
}
