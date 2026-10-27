import { pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { Highlighted } from './Highlighted'
import { snippet } from './highlight'
import { countLabel, KIND_LABEL, type Doc } from './searchModel'

type Props = {
  doc: Doc
  terms: readonly string[]
  selected: boolean
  onSelect: () => void
}

function Chip({ children }: { children: string }) {
  return <span className="max-w-[200px] truncate rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)]">{children}</span>
}

// One document that matches: its name, the best passage with the words marked, where it is kept and how much of it matched.
export function ResultRow({ doc, terms, selected, onSelect }: Props) {
  const best = doc.hits[0]
  const meta = [KIND_LABEL[doc.kind], pagesLabel(doc.pages), countLabel(doc.hits.length, 'passage', 'passages')].filter(Boolean)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={[
          'flex w-full cursor-pointer items-start gap-3.5 rounded-[14px] border px-4 py-3.5 text-left transition-colors',
          selected
            ? 'border-[color-mix(in_srgb,var(--accent-primary)_60%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--surface-panel))]'
            : 'border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] hover:bg-[var(--surface-hover)]'
        ].join(' ')}
      >
        <FileKindIcon kind={doc.kind} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-[var(--text-primary)]" title={doc.path}>
            {doc.name}
          </span>
          <span className="mt-1 line-clamp-2 block text-[13px] leading-[19px] text-[var(--text-secondary)]">
            <Highlighted text={snippet(best.text, terms, 220)} terms={terms} />
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>{doc.collection}</Chip>
            {doc.folder && <Chip>{doc.folder}</Chip>}
            <span className="text-[11.5px] text-[var(--text-muted)]">{meta.join('  •  ')}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
