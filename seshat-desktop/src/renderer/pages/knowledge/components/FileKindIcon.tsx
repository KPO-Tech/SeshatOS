import type { FileKind } from '../data/types'

const KINDS: Record<FileKind, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: 'var(--accent-danger)' },
  docx: { label: 'DOC', color: 'var(--accent-info)' },
  xlsx: { label: 'XLS', color: 'var(--accent-success)' },
  pptx: { label: 'PPT', color: 'var(--accent-warning)' },
  md: { label: 'MD', color: 'var(--text-muted)' }
}

export function FileKindIcon({ kind, size = 28 }: { kind: FileKind; size?: number }) {
  const { label, color } = KINDS[kind]
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[7px] text-[9px] font-bold tracking-[0.03em]"
      style={{ width: size, height: size, color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {label}
    </span>
  )
}
