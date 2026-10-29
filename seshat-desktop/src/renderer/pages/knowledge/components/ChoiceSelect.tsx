import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SelectorMenu, SelectorPill, type SelectorOption } from '@renderer/components/ui/SelectorPill'

type Props<K extends string> = {
  // What the control is for, read by a screen reader and shown before the choice ("Sort").
  label: string
  icon?: ReactNode
  choices: ReadonlyArray<readonly [K, string]>
  value: K
  onChange: (value: K) => void
  placement?: 'up' | 'down'
  align?: 'left' | 'right'
}

// One choice among a few, drawn like the other selectors of the app (the pill and the menu of the model and collection selectors) rather
// than as the browser's own drop-down.
export function ChoiceSelect<K extends string>({ label, icon, choices, value, onChange, placement = 'down', align = 'right' }: Props<K>) {
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

  const options = useMemo<SelectorOption[]>(() => choices.map(([id, text]) => ({ id, label: text })), [choices])
  const current = choices.find(([id]) => id === value)?.[1] ?? ''

  return (
    <div ref={root} className="relative shrink-0" aria-label={label}>
      <SelectorPill label={`${label}: ${current}`} icon={icon} onClick={() => setOpen((state) => !state)} active={open} className="h-8 max-w-full !gap-1.5 !px-[10px] !py-0" />
      {open && (
        <SelectorMenu
          placement={placement}
          align={align}
          className="min-w-[180px]"
          options={options}
          selectedId={value}
          onSelect={(id) => {
            setOpen(false)
            onChange(id as K)
          }}
        />
      )}
    </div>
  )
}
