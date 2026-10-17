import { fileIconName } from '@renderer/lib/fileIcon'

// The icons are Material Icon Theme (MIT) SVGs, copied by scripts/gen-file-icons.mjs.
const ICON_URLS = import.meta.glob('../../assets/file-icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function iconUrl(name: string): string | undefined {
  return ICON_URLS[`../../assets/file-icons/${name}.svg`] ?? ICON_URLS['../../assets/file-icons/file.svg']
}

/** The icon of a file type (Python, TypeScript, Markdown, PDF...), chosen from the path. */
export function FileIcon({ path, size = 16, className }: { path: string; size?: number; className?: string }) {
  return <img src={iconUrl(fileIconName(path))} width={size} height={size} alt="" aria-hidden="true" draggable={false} className={className} />
}
