import { FileIcon } from '@renderer/components/ui/FileIcon'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { baseName } from '@renderer/pages/knowledge/collections/openDocument'
import { ErrorPre } from '../common'
import type { ToolViewProps } from '../types'
import { parseKnowledgeRead } from './knowledgeReadResult'

const count = (value: number) => value.toLocaleString('en-US')

// The knowledge_read tool: a document of a collection, or the pages of it, read by the agent. Shown as a document: its name and where it
// is, how much of it this call read, then its text page by page.
export function KnowledgeReadToolView({ tool, result, status, expanded }: ToolViewProps) {
  const requested = typeof tool.input.file === 'string' ? tool.input.file : ''
  const pagesAsked = typeof tool.input.pages === 'string' ? tool.input.pages : ''
  const finished = Boolean(result)
  const read = result?.content && !result.isError ? parseKnowledgeRead(result.content) : null
  const reading = !finished && (status === 'running' || status === 'pending')
  const name = baseName(read?.file || requested)
  const share = read?.window && read.window.total > 0 ? Math.round((read.window.to / read.window.total) * 100) : null

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex items-start gap-3 rounded-app-md border border-solid border-app-border-subtle bg-app-surface px-3 py-2.5">
        <FileIcon path={name} size={22} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-app-text" title={read?.file || requested}>{name || 'Document'}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-app-text-muted">
            {read?.collection && <span>{read.collection}</span>}
            {(read?.pages || pagesAsked) && (
              <span className="rounded-[5px] border border-solid border-[rgba(239,124,47,0.2)] bg-[rgba(239,124,47,0.1)] px-1.5 py-px font-semibold text-[var(--accent-primary)]">
                {read?.pages || (pagesAsked.includes('-') ? `pp. ${pagesAsked}` : `p. ${pagesAsked}`)}
              </span>
            )}
          </div>
        </div>
      </div>

      {read?.window && (
        <div className="flex flex-col gap-1.5 px-1">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--border-soft)]" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--accent-primary)]" style={{ width: `${share ?? 0}%`, opacity: 0.85 }} />
          </div>
          <div className="text-[11.5px] text-app-text-muted">
            {read.window.end
              ? `Read to the end: ${count(read.window.total)} characters`
              : `Read ${count(read.window.from)} to ${count(read.window.to)} of ${count(read.window.total)} characters, the agent reads on from ${count(read.window.to)}`}
          </div>
        </div>
      )}

      {reading && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-6 animate-pulse rounded-app-md bg-app-surface" />
          ))}
        </div>
      )}

      {read && read.parts.length > 0 && (
        <div className={['flex flex-col gap-3', expanded ? '' : 'max-h-[22rem] overflow-y-auto'].join(' ')}>
          {read.parts.map((part, index) => (
            <section key={`${part.page ?? 'text'}-${index}`} className="rounded-app-md border border-solid border-app-border-subtle bg-app-surface">
              {part.page !== null && <header className="border-0 border-b border-solid border-app-border-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-app-text-muted">Page {part.page}</header>}
              <div className="px-3.5 py-3">
                <MarkdownView variant="document">{part.text}</MarkdownView>
              </div>
            </section>
          ))}
        </div>
      )}

      {finished && !result?.isError && !read && result?.content && (
        <p className="m-0 rounded-app-md border border-dashed border-app-border-subtle px-3 py-3 text-[12.5px] leading-[1.6] text-app-text-secondary">{result.content}</p>
      )}

      {result?.isError && result.content && <ErrorPre content={result.content} />}
    </div>
  )
}
