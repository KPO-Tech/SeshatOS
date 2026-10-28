import { useEffect, useState } from 'react'
import { CloseSmall } from '@icon-park/react'
import { api } from '@renderer/api/client'
import { pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { Highlighted } from './Highlighted'
import { snippet } from './highlight'
import { DocumentIndexPanel } from '../collections/DocumentIndexPanel'
import { ago, countLabel, KIND_LABEL, type Doc, type Hit } from './searchModel'

type Props = {
  doc: Doc
  terms: readonly string[]
  // Opens the document in the viewer, at a page when the passage has one.
  onOpen: (page?: number) => void
  onClose: () => void
}

type Tab = 'matches' | 'index' | 'details'

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// The document selected in the results: what matched in it, and what is known of it. Nothing is written for the person here: the
// passages are the ones the search found, as they are in the document.
export function DocumentDetails({ doc, terms, onOpen, onClose }: Props) {
  const first: Tab = doc.hits.length > 0 ? 'matches' : 'details'
  const [tab, setTab] = useState<Tab>(first)
  const [bytes, setBytes] = useState<number | null>(null)

  useEffect(() => {
    setTab(doc.hits.length > 0 ? 'matches' : 'details')
    setBytes(null)
    let cancelled = false
    api
      .get<{ size?: number }>(`/files/${encodeURIComponent(doc.fileId)}`)
      .then((file) => !cancelled && typeof file.size === 'number' && setBytes(file.size))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [doc.key, doc.fileId, doc.hits.length])

  const details: [string, string][] = [
    ['Type', KIND_LABEL[doc.kind]],
    ['Collection', doc.collection],
    ['Folder', doc.folder || 'None'],
    ['Size', bytes === null ? '' : size(bytes)],
    ['Added', ago(doc.addedAt)],
    ['Indexed as', doc.chunkCount > 0 ? countLabel(doc.chunkCount, 'passage', 'passages') : ''],
    ['Pages matched', doc.pages.length > 0 ? pagesLabel(doc.pages).replace(/^pp?\. /, '') : ''],
    ['Passages matched', doc.hits.length > 0 ? String(doc.hits.length) : '']
  ].filter((row): row is [string, string] => row[1] !== '')

  return (
    <aside aria-label="Selected document" className="no-scrollbar flex min-h-0 w-[320px] shrink-0 flex-col overflow-y-auto rounded-[16px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))]">
      <div className="flex items-start gap-3 border-b border-app-border-subtle p-4">
        <FileKindIcon kind={doc.kind} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 break-words text-[15px] font-semibold leading-[20px] text-[var(--text-primary)]">{doc.name}</h2>
          <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{[KIND_LABEL[doc.kind], doc.hits.length > 0 ? countLabel(doc.hits.length, 'passage matched', 'passages matched') : doc.chunkCount > 0 ? countLabel(doc.chunkCount, 'passage', 'passages') : ''].filter(Boolean).join('  •  ')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the details" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
          <CloseSmall size={16} />
        </button>
      </div>

      <div className="p-4 pb-3">
        <button
          type="button"
          onClick={() => onOpen(doc.hits.length > 0 ? doc.pages[0] : undefined)}
          className="h-9 w-full cursor-pointer rounded-[10px] border-0 bg-[var(--accent-primary)] text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          {doc.pages.length > 0 && doc.hits.length > 0 ? `Open at page ${doc.pages[0]}` : 'Open'}
        </button>
      </div>

      <div role="tablist" className="flex gap-5 border-b border-app-border-subtle px-4">
        {(doc.hits.length > 0 ? (['matches', 'index', 'details'] as const) : (['index', 'details'] as const)).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={[
              '-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-0 pb-2 pt-1 text-[13px] font-medium',
              tab === id ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            ].join(' ')}
          >
            {id === 'matches' ? 'Matches' : id === 'index' ? 'Index' : 'Details'}
          </button>
        ))}
      </div>

      {tab === 'index' ? (
        <div className="p-4">
          <DocumentIndexPanel corpusId={doc.corpusId} fileId={doc.fileId} />
        </div>
      ) : tab === 'matches' ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-4">
          {doc.hits.map((hit: Hit) => (
            <li key={hit.ref}>
              <button
                type="button"
                onClick={() => onOpen(hit.pages[0])}
                title={hit.pages.length > 0 ? `Open at page ${hit.pages[0]}` : 'Open the document'}
                className="w-full cursor-pointer rounded-[10px] border border-app-border-subtle bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                {(hit.pages.length > 0 || hit.section) && (
                  <span className="mb-1 block truncate text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">{[pagesLabel(hit.pages), hit.section].filter(Boolean).join('  •  ')}</span>
                )}
                <span className="block text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
                  <Highlighted text={snippet(hit.text, terms, 340)} terms={terms} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 p-4 text-[12.5px]">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-[var(--text-muted)]">{label}</dt>
              <dd className="m-0 min-w-0 break-words text-[var(--text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  )
}
