import { useState, type ReactNode } from 'react'
import { Right } from '@icon-park/react'

export type CitationPreview = {
  title: string
  meta: string
  // The passage the citation rests on, when there is one.
  excerpt?: string
  // What a click does, in words: "Open at page 12".
  action: string
  mark: (size: number) => ReactNode
}

type Props = {
  mark: ReactNode
  label: string
  preview: CitationPreview
  active?: boolean
  onHover?: (hovering: boolean) => void
  onOpen: () => void
}

// A citation inside an answer: the mark of the source and its name, cut when long. Hovering it shows what it points to; clicking opens it.
export function CitationChip({ mark, label, preview, active = false, onHover, onOpen }: Props) {
  const [alignRight, setAlignRight] = useState(false)

  return (
    <span
      className="group/cite relative mx-[3px] inline-block align-[1px]"
      onMouseEnter={(event) => {
        setAlignRight(event.currentTarget.getBoundingClientRect().left > window.innerWidth * 0.5)
        onHover?.(true)
      }}
      onMouseLeave={() => onHover?.(false)}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex h-[18px] max-w-[150px] cursor-pointer items-center gap-[3px] rounded-full border border-solid py-0 pl-[3px] pr-1.5 text-[10.5px] font-medium leading-none transition-colors ${
          active
            ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--text-primary)]'
            : 'border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
        }`}
      >
        {mark}
        <span className="truncate">{label}</span>
      </button>

      <span className={`absolute top-full z-30 hidden pt-1.5 group-focus-within/cite:block group-hover/cite:block ${alignRight ? 'right-0' : 'left-0'}`}>
        <span
          className="block w-[300px] rounded-xl border border-solid border-[var(--border-soft)] bg-[var(--surface-menu)] p-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
          style={{ animation: 'fade-in 140ms ease both' }}
        >
          <span className="flex items-center gap-2">
            {preview.mark(22)}
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{preview.title}</span>
          </span>
          <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">{preview.meta}</span>
          {preview.excerpt && (
            <span className="mt-2 block border-0 border-l-2 border-solid border-[var(--border-strong)] pl-2.5 text-[12px] leading-[18px] text-[var(--text-secondary)]">{preview.excerpt}</span>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--accent-primary)]">
            {preview.action}
            <Right size={11} />
          </span>
        </span>
      </span>
    </span>
  )
}
