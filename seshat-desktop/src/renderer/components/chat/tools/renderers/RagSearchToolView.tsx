import { useCorpusName } from '@renderer/hooks/useCorpusName'
import { CodeBox, ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'
import { parseRagResults } from './ragResults'

export function RagSearchToolView({ tool, result }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const corpusId = typeof tool.input.corpus_id === 'string' ? tool.input.corpus_id : ''
  const corpusName = useCorpusName(corpusId)
  const parsed = result?.content && !result.isError ? parseRagResults(result.content) : null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5">
        {query && <span className="font-['JetBrains_Mono','Fira_Code',monospace] text-[12px] font-bold text-[var(--accent-primary)]">{query}</span>}
        {corpusId && <span className="shrink-0 whitespace-nowrap rounded-[5px] border border-[rgba(239,124,47,0.2)] bg-[rgba(239,124,47,0.1)] px-1.5 py-px text-[11px] font-semibold text-[var(--accent-primary)]" title={corpusId}>{corpusName ?? corpusId}</span>}
      </div>

      {result?.content && !result.isError && (
        <Section label={parsed ? `Sources (${parsed.length})` : 'Results'}>
          {parsed ? (
            <div className="flex flex-col gap-2">
              {parsed.map((item) => (
                <div key={item.index} className="rounded-app-md border border-app-border-subtle bg-app-surface px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-app-text-muted">
                    <span className="font-bold text-app-text-secondary">[{item.index}]</span>
                    <span className="min-w-0 truncate font-semibold text-app-text" title={item.file}>{item.file ?? item.corpus}</span>
                    {item.file && <span className="truncate">{item.corpus}</span>}
                    <span className="ml-auto shrink-0 tabular-nums">{Math.round(item.score * 100)}% match</span>
                  </div>
                  <div className="mt-1 max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-[1.55] text-app-text-secondary">{item.text}</div>
                </div>
              ))}
            </div>
          ) : (
            <CodeBox content={result.content} copyable />
          )}
        </Section>
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <ErrorPre content={result.content} />
        </Section>
      )}
    </>
  )
}
