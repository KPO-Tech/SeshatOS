import { useEffect, useRef, useState } from 'react'
import { Bank, Book, Briefcase, ChartLine, Code, Cube, DataFile, Experiment, FileText, FolderOpen, Globe, Home, Hospital, Inbox, Key, Lightning, Protect, School, Star, Tool, Wallet } from '@icon-park/react'

type IconComponent = typeof FolderOpen

// The icons a person can give a source. The key is what the backend keeps, so it never changes; an unknown key (written by a newer
// version) is shown as the kind's own icon.
const ICONS: Array<{ key: string; label: string; Icon: IconComponent }> = [
  { key: 'folder', label: 'Folder', Icon: FolderOpen },
  { key: 'briefcase', label: 'Work', Icon: Briefcase },
  { key: 'book', label: 'Library', Icon: Book },
  { key: 'bank', label: 'Finance', Icon: Bank },
  { key: 'wallet', label: 'Accounts', Icon: Wallet },
  { key: 'chart', label: 'Reports', Icon: ChartLine },
  { key: 'document', label: 'Documents', Icon: FileText },
  { key: 'data', label: 'Data', Icon: DataFile },
  { key: 'code', label: 'Code', Icon: Code },
  { key: 'tool', label: 'Tools', Icon: Tool },
  { key: 'cube', label: 'Projects', Icon: Cube },
  { key: 'flask', label: 'Research', Icon: Experiment },
  { key: 'school', label: 'Education', Icon: School },
  { key: 'hospital', label: 'Health', Icon: Hospital },
  { key: 'shield', label: 'Compliance', Icon: Protect },
  { key: 'key', label: 'Private', Icon: Key },
  { key: 'inbox', label: 'Inbox', Icon: Inbox },
  { key: 'globe', label: 'Public', Icon: Globe },
  { key: 'home', label: 'Personal', Icon: Home },
  { key: 'star', label: 'Favourite', Icon: Star },
  { key: 'bolt', label: 'Active', Icon: Lightning }
]

/** The icon of a source: the one the person chose, or the folder icon of its kind. */
export function SourceIcon({ icon, size = 18 }: { icon?: string; size?: number }) {
  const Icon = ICONS.find((i) => i.key === icon)?.Icon ?? FolderOpen
  return <Icon size={size} />
}

/** A button showing the current icon, that opens the choice of another. The default source has no picker: it keeps its own. */
export function SourceIconPicker({ value, onChange, disabled }: { value: string; onChange: (key: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-label="Change the icon"
        aria-expanded={open}
        title="Change the icon"
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border-0 bg-[var(--accent-subtle)] text-[var(--accent-primary)] transition-[box-shadow] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_35%,transparent)] disabled:cursor-default"
      >
        <SourceIcon icon={value} size={20} />
      </button>
      {open && (
        <div role="listbox" aria-label="Icons" className="absolute left-0 top-12 z-[60] grid w-[236px] grid-cols-6 gap-1 rounded-xl border border-app-border-subtle bg-[var(--surface-panel)] p-2 shadow-[var(--shadow-medium)]">
          {ICONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={value === key || (value === '' && key === 'folder')}
              aria-label={label}
              title={label}
              onClick={() => {
                setOpen(false)
                onChange(key === 'folder' ? '' : key)
              }}
              className={`flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] ${
                value === key || (value === '' && key === 'folder') ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'bg-transparent'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
