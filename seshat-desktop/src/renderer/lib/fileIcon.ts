import { DEFAULT_FILE_ICON, ICON_BY_EXTENSION, ICON_BY_FILE_NAME } from './fileIconMap'

function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

/** The name of the icon (a file of assets/file-icons) for a path: by exact file name, then by extension. */
export function fileIconName(path: string): string {
  const name = baseName(path).toLowerCase()
  const byName = ICON_BY_FILE_NAME[name]
  if (byName) return byName
  const dot = name.lastIndexOf('.')
  if (dot >= 0 && dot < name.length - 1) {
    const byExtension = ICON_BY_EXTENSION[name.slice(dot + 1)]
    if (byExtension) return byExtension
  }
  return DEFAULT_FILE_ICON
}
