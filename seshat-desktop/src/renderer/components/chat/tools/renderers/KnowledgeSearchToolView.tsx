import { useState } from 'react'
import { Search } from '@icon-park/react'
import { FileIcon } from '@renderer/components/ui/FileIcon'
import { useCorpusName } from '@renderer/hooks/useCorpusName'
import { passagesOfResult, type Passage } from '@renderer/pages/knowledge/chat/knowledgeSearchResults'
import { groupPassages, pagesLabel, type PassageGroup } from '@renderer/pages/knowledge/chat/passageSources'
import { baseName, openDocument, passageTarget } from '@renderer/pages/knowledge/collections/openDocument'
import { ErrorPre } from '../common'
import type { ToolViewProps } from '../types'
import { excerptBody, isLongExcerpt, relevance, searchSummary, sectionTrail } from './knowledgeSearchSummary'

function Meter({ score }: { score: number }) {
  const percent = relevance(score)
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-app-text-muted" title={`${percent}% match`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-app-border-subtle">
        <span className="block h-full rounded-full bg-[var(--accent-primary)]" style={{ width: `${percent}%`, opacity: 0.35 + percent / 160 }} />
      </span>
      {percent}%
    </span>
  )
}

function PassageRow({ passage, expanded }: { passage: Passage; expanded: boolean }) {
  const [open, setOpen] = useState(false)
  const body = excerptBody(passage.text, passage.section)
  const long = isLongExcerpt(body)
  const trail = sectionTrail(passage.section)
  const canOpen = Boolean(passage.fileId && passage.corpusId)
  const pages = pagesLabel(passage.pages)
  const open_ = () => {
    if (!passage.fileId || !passage.corpusId) return
    const target = passageTarget(passage.text, passage.pages)
    void openDocument({ fileId: passage.fileId, name: passage.file }, passage.corpusId, target.page, target.highlight)
  }
  return (
    <div className="flex flex-col gap-1.5 border-0 border-t border-solid border-app-border-subtle px-3 py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-app-text-muted">
        <span className="rounded-[4px] bg-[var(--surface-muted)] px-1.5 py-px font-mono text-[10.5px] text-app-text-secondary" title="The reference the answer cites it by">
          {passage.ref}
        </span>
        {pages && <span className="font-medium text-app-text-secondary">{pages}</span>}
        {trail && <span className="min-w-0 truncate" title={trail}>{trail}</span>}
        <Meter score={passage.score} />
      </div>
      <div
        className={`whitespace-pre-wrap break-words leading-[1.6] text-app-text-secondary ${expanded ? 'text-[13.5px]' : 'text-[12.5px]'} ${open ? '' : expanded ? 'line-clamp-6' : 'line-clamp-4'}`}
      >
        {body}
      </div>
      {(long || canOpen) && (
        <div className="flex items-center gap-3 text-[11.5px]">
          {long && (
            <button type="button" onClick={() => setOpen((value) => !value)} className="cursor-pointer border-0 bg-transparent p-0 font-medium text-app-text-muted hover:text-app-text">
              {open ? 'Show less' : 'Show more'}
            </button>
          )}
          {canOpen && (
            <button type="button" onClick={open_} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[var(--accent-primary)] hover:underline">
              {passage.pages.length > 0 ? `Open at ${pagesLabel(passage.pages.slice(0, 1))}` : 'Open document'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentCard({ group, expanded }: { group: PassageGroup; expanded: boolean }) {
  const pages = pagesLabel(group.pages)
  return (
    <section className="overflow-hidden rounded-app-md border border-solid border-app-border-subtle bg-app-surface">
      <header className="flex items-center gap-2.5 bg-[var(--surface-muted)] px-3 py-2">
        <FileIcon path={baseName(group.title)} size={18} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-app-text" title={group.title}>{baseName(group.title)}</div>
          <div className="truncate text-[11px] text-app-text-muted">{[group.collection, pages].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="shrink-0 rounded-full border border-solid border-app-border-subtle px-2 py-px text-[10.5px] tabular-nums text-app-text-muted">
          {group.passages.length}
        </span>
      </header>
      {group.passages.map((passage) => (
        <PassageRow key={passage.ref} passage={passage} expanded={expanded} />
      ))}
    </section>
  )
}

// The knowledge_search tool: what was asked, and the passages it found, by document, with the page, the section and how well each matches.
// Opened in the side panel it uses the room; in the chat it is the same view, with the excerpts cut shorter.
export function KnowledgeSearchToolView({ tool, result, status, expanded }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const corpusId = typeof tool.input.corpus_id === 'string' ? tool.input.corpus_id : ''
  const corpusName = useCorpusName(corpusId)
  const finished = Boolean(result)
  const passages = result?.content && !result.isError ? passagesOfResult(result.content, result.metadata) : []
  const groups = groupPassages(passages)
  const summary = searchSummary(passages)
  const searching = !finished && (status === 'running' || status === 'pending')

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2 rounded-app-md border border-solid border-app-border-subtle bg-app-surface px-3 py-2">
          <Search size={14} className="mt-0.5 shrink-0 text-[var(--accent-primary)]" />
          <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-app-text">{query || 'Search'}</span>
          {corpusId && (
            <span className="shrink-0 whitespace-nowrap rounded-[5px] border border-[rgba(239,124,47,0.2)] bg-[rgba(239,124,47,0.1)] px-1.5 py-px text-[11px] font-semibold text-[var(--accent-primary)]" title={corpusId}>
              {corpusName ?? corpusId}
            </span>
          )}
        </div>
        <div className="px-1 text-[11.5px] text-app-text-muted">
          {searching ? 'Searching the collections' : summary || (result?.isError ? '' : 'No passage matched')}
        </div>
      </div>

      {searching && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="h-20 animate-pulse rounded-app-md bg-app-surface" />
          ))}
        </div>
      )}

      {groups.map((group) => (
        <DocumentCard key={group.key} group={group} expanded={Boolean(expanded)} />
      ))}

      {finished && !result?.isError && passages.length === 0 && (
        <p className="m-0 rounded-app-md border border-dashed border-app-border-subtle px-3 py-3 text-[12px] leading-[1.6] text-app-text-muted">
          Nothing in the collections answers this search. The agent may try other words.
        </p>
      )}

      {result?.isError && result.content && <ErrorPre content={result.content} />}
    </div>
  )
}
