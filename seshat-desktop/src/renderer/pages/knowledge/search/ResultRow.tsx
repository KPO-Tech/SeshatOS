import { pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { Highlighted } from './Highlighted'
import { snippet } from './highlight'
import { ago, countLabel, KIND_LABEL, type Doc, type Hit } from './searchModel'

export type View = 'list' | 'grid'

type Props = {
  doc: Doc
  terms: readonly string[]
  // The document is the one open in the viewer.
  opened: boolean
  view: View
  // Opens the document: at the passage given (marked there), or on its first page when there is none.
  onOpen: (hit?: Hit) => void
}

// The other passages of a document that matched, as buttons that go to them; the row itself goes to the best one.
const MORE_PASSAGES = 6
const MANY_PAGES = 4

function Chip({ children }: { children: string }) {
  return <span className="min-w-0 max-w-full truncate rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)]">{children}</span>
}

// One document: its name, the best passage with the words marked (or where it is kept, before any search), the chips of its collection
// and folder, what kind it is and how much of it is indexed, and when it was added. Clicking it opens the document at the best passage.
//
// Each row is its own container, so that it is laid out by its own width, not the window's: a list row is one line of icon, text and date
// when it is wide, and the date moves under the text when it is narrow; a grid card is always a column, whatever its width.
export function ResultRow({ doc, terms, opened, view, onOpen }: Props) {
  const best = doc.hits[0]
  const passages = doc.hits.length > 0 ? countLabel(doc.hits.length, 'passage matched', 'passages matched') : doc.chunkCount > 0 ? countLabel(doc.chunkCount, 'passage', 'passages') : ''
  // A document with passages on many pages names the first ones; the buttons under the row go to the others.
  const pagesText = doc.pages.length > MANY_PAGES ? `${pagesLabel(doc.pages.slice(0, MANY_PAGES))} …` : pagesLabel(doc.pages)
  const meta = [KIND_LABEL[doc.kind], pagesText, passages].filter(Boolean)
  const added = ago(doc.addedAt)
  const grid = view === 'grid'
  const more = doc.hits.slice(1, 1 + MORE_PASSAGES)

  return (
    <li className="@container min-w-0">
      <div
        className={[
          'flex h-full flex-col rounded-[12px] border transition-colors',
          opened
            ? 'border-[color-mix(in_srgb,var(--accent-primary)_60%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--surface-panel))]'
            : 'border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] hover:bg-[var(--surface-hover)]'
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => onOpen(best)}
          aria-current={opened}
          title={best && best.pages.length > 0 ? `Open at page ${best.pages[0]}` : 'Open the document'}
          className="flex w-full min-w-0 flex-1 cursor-pointer items-start gap-3 border-0 bg-transparent p-3.5 text-left"
        >
          <span className="shrink-0">
            <FileKindIcon kind={doc.kind} size={grid ? 36 : 40} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={['block text-[14.5px] font-semibold leading-[20px] text-[var(--text-primary)]', grid ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'truncate'].join(' ')} title={doc.path}>
              {doc.name}
            </span>
            <span className={['mt-1 block text-[13px] leading-[19px] text-[var(--text-secondary)] [overflow-wrap:anywhere]', grid ? 'line-clamp-4' : 'line-clamp-2'].join(' ')}>
              {best ? <Highlighted text={snippet(best.text, terms, 240)} terms={terms} /> : doc.folder}
            </span>
            <span className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <Chip>{doc.collection}</Chip>
              {doc.folder && <Chip>{doc.folder}</Chip>}
              <span className="text-[11.5px] text-[var(--text-muted)]">{meta.join('  •  ')}</span>
              {added && <span className={['text-[11.5px] text-[var(--text-muted)]', grid ? '' : '@xl:hidden'].join(' ')}>{`Added ${added}`}</span>}
            </span>
          </span>
          {added && !grid && <span className="hidden shrink-0 self-end whitespace-nowrap pb-0.5 text-[12px] text-[var(--text-muted)] @xl:block">{`Added ${added}`}</span>}
        </button>

        {more.length > 0 && (
          <div className={['flex min-w-0 flex-wrap items-center gap-1.5 px-3.5 pb-3', grid ? '' : '@xl:pl-[66px]'].join(' ')}>
            <span className="text-[11.5px] text-[var(--text-muted)]">Also</span>
            {more.map((hit) => (
              <button
                key={hit.ref}
                type="button"
                onClick={() => onOpen(hit)}
                title={hit.section || 'Open this passage'}
                className="cursor-pointer whitespace-nowrap rounded-md border border-app-border-subtle bg-transparent px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                {pagesLabel(hit.pages) || hit.section || 'passage'}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
