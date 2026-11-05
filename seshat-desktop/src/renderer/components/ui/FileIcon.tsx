import { fileIconName, folderIconName } from '@renderer/lib/fileIcon'

// The icons are Material Icon Theme (MIT) SVGs, copied by scripts/gen-file-icons.mjs.
const ICON_URLS = import.meta.glob('../../assets/file-icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function iconUrl(name: string, fallback: string): string | undefined {
  return ICON_URLS[`../../assets/file-icons/${name}.svg`] ?? ICON_URLS[`../../assets/file-icons/${fallback}.svg`]
}

type IconProps = { size?: number; className?: string }

/** The icon of a file type (Python, TypeScript, Markdown, PDF...), chosen from the path. */
export function FileIcon({ path, size = 16, className }: IconProps & { path: string }) {
  return <img src={iconUrl(fileIconName(path), 'file')} width={size} height={size} alt="" aria-hidden="true" draggable={false} className={className} />
}

/** The icon of a folder, chosen from its name (src, docs, .github...), open or closed. */
export function FolderIcon({ path, open, size = 16, className }: IconProps & { path: string; open: boolean }) {
  return <img src={iconUrl(folderIconName(path, open), open ? 'folder-open' : 'folder')} width={size} height={size} alt="" aria-hidden="true" draggable={false} className={className} />
}
