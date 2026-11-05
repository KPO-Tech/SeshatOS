import { DEFAULT_FILE_ICON, DEFAULT_FOLDER_ICON, ICON_BY_EXTENSION, ICON_BY_FILE_NAME, ICON_BY_FOLDER_NAME } from './fileIconMap'

function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

/** The name of the icon (a file of assets/file-icons) for a path: by exact file name, then by extension, the longest one first. */
export function fileIconName(path: string): string {
  const name = baseName(path).toLowerCase()
  const byName = ICON_BY_FILE_NAME[name]
  if (byName) return byName
  // "app.test.ts" is a test file before it is a TypeScript one: "test.ts" is tried before "ts".
  let dot = name.indexOf('.')
  while (dot >= 0 && dot < name.length - 1) {
    const byExtension = ICON_BY_EXTENSION[name.slice(dot + 1)]
    if (byExtension) return byExtension
    dot = name.indexOf('.', dot + 1)
  }
  return DEFAULT_FILE_ICON
}

/** The name of the icon for a folder, by its name; the open one is the closed one followed by "-open". */
export function folderIconName(path: string, open: boolean): string {
  const closed = ICON_BY_FOLDER_NAME[baseName(path).toLowerCase()] ?? DEFAULT_FOLDER_ICON
  return open ? `${closed}-open` : closed
}
