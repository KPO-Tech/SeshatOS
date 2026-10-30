import { useState } from 'react'
import { sectionTrail } from '@renderer/components/chat/tools/renderers/knowledgeSearchSummary'
import { pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { cleanExcerpt } from './excerpt'
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
  // The best score of the search, to show how this document compares with it; absent when the documents are only listed.
  topScore?: number
  // This document is the first of a search sorted by relevance with several results.
  best?: boolean
  // Opens the document: at the passage given (marked there), or on its first page when there is none.
  onOpen: (hit?: Hit) => void
}

// The other passages of a document that matched, as buttons that go to them; the row itself goes to the best one.
const MORE_PASSAGES = 12
const MORE_SHOWN = 4
const MANY_PAGES = 4

function Chip({ children }: { children: string }) {
  return <span className="min-w-0 max-w-full truncate rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)]">{children}</span>
}

// How well the document matches, against the best of the search: the best fills the bar. The raw scores are low numbers that read as a poor
// match whatever they are, so only the comparison is shown.
function Meter({ score, top }: { score: number; top: number }) {
  const share = top > 0 ? Math.max(0.08, Math.min(1, score / top)) : 1
  return (
    <span className="flex h-1 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--border-soft)]" title={`Match ${score.toFixed(2)}`} aria-hidden="true">
      <span className="block h-full rounded-full bg-[var(--accent-primary)]" style={{ width: `${Math.round(share * 100)}%`, opacity: 0.4 + share * 0.6 }} />
    </span>
  )
}

// One document: its name, the best passage with the words marked (or where it is kept, before any search), the chips of its collection
// and folder, what kind it is and how much of it is indexed, and when it was added. Clicking it opens the document at the best passage.
//
// Each row is its own container, so that it is laid out by its own width, not the window's: a list row is one line of icon, text and date
// when it is wide, and the date moves under the text when it is narrow; a grid card is always a column, whatever its width.
export function ResultRow({ doc, terms, opened, view, topScore, best: isBest = false, onOpen }: Props) {
  const [allOthers, setAllOthers] = useState(false)
  const top = doc.hits[0]
  const found = doc.hits.length > 0
  const passages = found ? countLabel(doc.hits.length, 'passage matched', 'passages matched') : doc.chunkCount > 0 ? countLabel(doc.chunkCount, 'passage', 'passages') : ''
  // A document with passages on many pages names the first ones; the buttons under the row go to the others.
  const pagesText = doc.pages.length > MANY_PAGES ? `${pagesLabel(doc.pages.slice(0, MANY_PAGES))} …` : pagesLabel(doc.pages)
  const meta = [KIND_LABEL[doc.kind], pagesText, passages].filter(Boolean)
  const added = ago(doc.addedAt)
  const grid = view === 'grid'
  const others = doc.hits.slice(1, 1 + MORE_PASSAGES)
  const shownOthers = allOthers ? others : others.slice(0, MORE_SHOWN)
  const trail = top ? sectionTrail(top.section) : ''
  const topPage = top ? pagesLabel(top.pages.slice(0, 1)) : ''
  const excerpt = top ? snippet(cleanExcerpt(top.text, top.section), terms, 240) : ''

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
          onClick={() => onOpen(top)}
          aria-current={opened}
          title={top && top.pages.length > 0 ? `Open at page ${top.pages[0]}` : 'Open the document'}
          className={['flex w-full min-w-0 flex-1 cursor-pointer items-start gap-3 border-0 bg-transparent text-left', found ? 'p-3.5' : 'px-3 py-2.5'].join(' ')}
        >
          <span className="shrink-0">
            <FileKindIcon kind={doc.kind} size={grid ? 36 : found ? 40 : 32} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className={['block min-w-0 text-[14.5px] font-semibold leading-[20px] text-[var(--text-primary)]', grid ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'truncate'].join(' ')} title={doc.path}>
                {doc.name}
              </span>
              {isBest && <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] px-2 py-px text-[10.5px] font-semibold text-[var(--accent-primary)]">Best match</span>}
              {found && topScore !== undefined && !grid && (
                <span className="ml-auto flex shrink-0 items-center">
                  <Meter score={doc.score} top={topScore} />
                </span>
              )}
            </span>
            {found && (topPage || trail) && (
              <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
                {topPage && <span className="shrink-0 font-medium text-[var(--text-secondary)]">{topPage}</span>}
                {trail && (
                  <span className="min-w-0 truncate" title={trail}>
                    {trail}
                  </span>
                )}
              </span>
            )}
            {found && excerpt && (
              <span className={['mt-1 block text-[13px] leading-[19px] text-[var(--text-secondary)] [overflow-wrap:anywhere]', grid ? 'line-clamp-4' : 'line-clamp-3'].join(' ')}>
                <Highlighted text={excerpt} terms={terms} />
              </span>
            )}
            <span className={['flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1', found ? 'mt-2.5' : 'mt-1'].join(' ')}>
              <Chip>{doc.collection}</Chip>
              {doc.folder && <Chip>{doc.folder}</Chip>}
              <span className="text-[11.5px] text-[var(--text-muted)]">{meta.join('  •  ')}</span>
              {added && <span className={['text-[11.5px] text-[var(--text-muted)]', grid ? '' : '@xl:hidden'].join(' ')}>{`Added ${added}`}</span>}
            </span>
          </span>
          {added && !grid && <span className="hidden shrink-0 self-end whitespace-nowrap pb-0.5 text-[12px] text-[var(--text-muted)] @xl:block">{`Added ${added}`}</span>}
        </button>

        {others.length > 0 && (
          <div className={['flex min-w-0 flex-wrap items-center gap-1 px-3.5 pb-3', grid ? '' : '@xl:pl-[66px]'].join(' ')}>
            <span className="mr-0.5 text-[11px] text-[var(--text-muted)]">Other matches</span>
            {shownOthers.map((hit) => (
              <button
                key={hit.ref}
                type="button"
                onClick={() => onOpen(hit)}
                title={sectionTrail(hit.section) || 'Open this passage'}
                className="cursor-pointer whitespace-nowrap rounded-[5px] border border-app-border-subtle bg-transparent px-1.5 py-px text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                {pagesLabel(hit.pages) || sectionTrail(hit.section) || 'passage'}
              </button>
            ))}
            {others.length > MORE_SHOWN && (
              <button
                type="button"
                onClick={() => setAllOthers((value) => !value)}
                className="cursor-pointer border-0 bg-transparent px-1 py-px text-[11px] font-medium text-[var(--accent-primary)] hover:underline"
              >
                {allOthers ? 'Fewer' : `+${others.length - MORE_SHOWN}`}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
