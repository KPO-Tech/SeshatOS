import { useEffect, useState } from 'react'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { fetchPassages, type Passage } from './collectionsApi'

type State = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready'; passages: Passage[] }

// The passages a document was indexed as: what a search can bring back for it, in the order of the document.
export function DocumentIndexPanel({ corpusId, fileId }: { corpusId: string; fileId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  // The passages are Markdown (tables, headings): shown formatted, or as the exact text that was indexed.
  const [raw, setRaw] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchPassages(corpusId, fileId)
      .then((passages) => !cancelled && setState({ status: 'ready', passages }))
      .catch((error) => !cancelled && setState({ status: 'failed', message: error instanceof Error && error.message ? error.message : 'The passages could not be read.' }))
    return () => {
      cancelled = true
    }
  }, [corpusId, fileId])

  if (state.status === 'loading') return <p className="m-0 text-[12px] text-[var(--text-muted)]">Reading the index...</p>
  if (state.status === 'failed') {
    return (
      <p className="m-0 text-[12px] text-[var(--accent-danger)]" role="alert">
        {state.message}
      </p>
    )
  }
  if (state.passages.length === 0) {
    return <p className="m-0 text-[12px] leading-[18px] text-[var(--text-muted)]">This document has no passages yet. It appears here once it is indexed.</p>
  }

  const characters = state.passages.reduce((total, passage) => total + passage.text.length, 0)
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-[12px] text-[var(--text-muted)]">
          {state.passages.length} {state.passages.length === 1 ? 'passage' : 'passages'}, {characters.toLocaleString('en-US')} characters. A search returns these pieces, not the whole document.
        </p>
        <button
          type="button"
          onClick={() => setRaw((shown) => !shown)}
          className="shrink-0 cursor-pointer rounded-[7px] border border-app-border-subtle bg-transparent px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          title={raw ? 'Show the passages formatted' : 'Show the exact text that was indexed'}
        >
          {raw ? 'Formatted' : 'Raw text'}
        </button>
      </div>
      {state.passages.map((passage) => (
        <article key={passage.position} className="rounded-[10px] border border-app-border-subtle bg-[var(--surface-muted)] px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <span>Passage {passage.position + 1}</span>
            <span>{passage.text.length.toLocaleString('en-US')} characters</span>
          </div>
          {raw ? (
            <p className="m-0 whitespace-pre-wrap break-words text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{passage.text}</p>
          ) : (
            <div className="overflow-x-auto text-[12.5px]">
              <MarkdownView>{passage.text}</MarkdownView>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
