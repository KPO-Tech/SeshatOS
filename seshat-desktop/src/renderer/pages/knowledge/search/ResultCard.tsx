import { useState } from 'react'
import type { Passage } from '../chat/knowledgeSearchResults'
import { kindOfFile, pagesLabel, type PassageGroup } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { Highlighted } from './Highlighted'
import { snippet } from './highlight'

const SHOWN = 2

type Props = {
  group: PassageGroup
  terms: readonly string[]
  onOpen: (passage: Passage) => void
}

// One document that matches: its name, where it is, and the passages where the words were found.
export function ResultCard({ group, terms, onOpen }: Props) {
  const [all, setAll] = useState(false)
  const first = group.passages[0]
  const shown = all ? group.passages : group.passages.slice(0, SHOWN)
  const hidden = group.passages.length - SHOWN
  const meta = [group.collection, pagesLabel(group.pages)].filter(Boolean)

  return (
    <article className="rounded-2xl border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] px-4 py-3.5">
      <button type="button" onClick={() => onOpen(first)} className="group flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left">
        <FileKindIcon kind={kindOfFile(first.file)} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]">{group.title}</span>
          <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">{meta.join('   ')}</span>
        </span>
      </button>
      <ul className="m-0 mt-2.5 flex list-none flex-col gap-1 p-0">
        {shown.map((passage) => (
          <li key={passage.ref}>
            <button
              type="button"
              onClick={() => onOpen(passage)}
              className="w-full cursor-pointer rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] leading-[20px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <Highlighted text={snippet(passage.text, terms)} terms={terms} />
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className="mt-1.5 cursor-pointer border-0 bg-transparent px-2.5 py-0.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {all ? 'Show fewer' : `Show ${hidden} more ${hidden === 1 ? 'passage' : 'passages'}`}
        </button>
      )}
    </article>
  )
}
