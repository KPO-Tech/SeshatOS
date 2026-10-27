import { pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { Highlighted } from './Highlighted'
import { snippet } from './highlight'
import { ago, countLabel, KIND_LABEL, type Doc } from './searchModel'

export type View = 'list' | 'grid'

type Props = {
  doc: Doc
  terms: readonly string[]
  selected: boolean
  view: View
  onSelect: () => void
}

function Chip({ children }: { children: string }) {
  return <span className="max-w-[200px] truncate rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)]">{children}</span>
}

// One document: its name, the best passage with the words marked (or where it is kept, before any search), the chips of its collection
// and folder, what kind it is and how much of it is indexed, and when it was added.
export function ResultRow({ doc, terms, selected, view, onSelect }: Props) {
  const best = doc.hits[0]
  const passages = doc.hits.length > 0 ? countLabel(doc.hits.length, 'passage matched', 'passages matched') : doc.chunkCount > 0 ? countLabel(doc.chunkCount, 'passage', 'passages') : ''
  const meta = [KIND_LABEL[doc.kind], pagesLabel(doc.pages), passages].filter(Boolean)
  const added = ago(doc.addedAt)
  const grid = view === 'grid'

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={[
          'flex h-full w-full cursor-pointer gap-4 rounded-[14px] border px-4 py-3.5 text-left transition-colors',
          grid ? 'flex-col' : 'items-start',
          selected
            ? 'border-[color-mix(in_srgb,var(--accent-primary)_60%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--surface-panel))]'
            : 'border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] hover:bg-[var(--surface-hover)]'
        ].join(' ')}
      >
        <FileKindIcon kind={doc.kind} size={grid ? 40 : 46} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-[var(--text-primary)]" title={doc.path}>
            {doc.name}
          </span>
          <span className={['mt-1 block text-[13px] leading-[19px] text-[var(--text-secondary)]', grid ? 'line-clamp-3' : 'line-clamp-2'].join(' ')}>
            {best ? <Highlighted text={snippet(best.text, terms, 220)} terms={terms} /> : doc.folder}
          </span>
          <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip>{doc.collection}</Chip>
            {doc.folder && <Chip>{doc.folder}</Chip>}
            <span className="text-[11.5px] text-[var(--text-muted)]">{meta.join('  •  ')}</span>
          </span>
        </span>
        {added && !grid && <span className="shrink-0 self-end whitespace-nowrap pb-0.5 text-[12px] text-[var(--text-muted)]">Added {added}</span>}
        {added && grid && <span className="text-[12px] text-[var(--text-muted)]">Added {added}</span>}
      </button>
    </li>
  )
}
