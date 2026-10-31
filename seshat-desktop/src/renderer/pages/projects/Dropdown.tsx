import { useEffect, useRef, useState, type ReactNode } from 'react'

export type DropdownItem = {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  /** The one in use, for a list of choices. */
  checked?: boolean
  onSelect: () => void
}

type Props = {
  /** Draws the button that opens the menu. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  label: string
}

/** A small menu under a button: closes on a choice, on a click elsewhere and on Escape. */
export function Dropdown({ trigger, items, align = 'right', label }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full z-30 mt-1.5 min-w-[190px] overflow-hidden rounded-xl border border-app-border-subtle bg-[var(--surface-panel)] p-1 shadow-[var(--shadow-medium)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13px] hover:bg-[var(--surface-hover)] ${item.danger ? 'text-[var(--accent-danger)]' : 'text-[var(--text-primary)]'}`}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-[var(--text-muted)]">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.checked && <span className="text-[var(--accent-primary)]">&#10003;</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
