import { CodeBox, ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'

export function RagSearchToolView({ tool, result }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const corpusId = typeof tool.input.corpus_id === 'string' ? tool.input.corpus_id : ''

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5">
        {query && <span className="font-['JetBrains_Mono','Fira_Code',monospace] text-[12px] font-bold text-[var(--color-accent)]">{query}</span>}
        {corpusId && <span className="shrink-0 whitespace-nowrap rounded-[5px] border border-[rgba(239,124,47,0.2)] bg-[rgba(239,124,47,0.1)] px-1.5 py-px text-[11px] font-semibold text-[var(--color-accent)]">corpus: {corpusId}</span>}
      </div>

      {result?.content && !result.isError && (
        <Section label="Results">
          <CodeBox content={result.content} copyable />
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
