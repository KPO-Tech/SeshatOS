import { CodeBox, ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'

// The knowledge_read tool: the text of one document of a collection, whole or by pages.
export function KnowledgeReadToolView({ tool, result }: ToolViewProps) {
  const file = typeof tool.input.file === 'string' ? tool.input.file : ''
  const pages = typeof tool.input.pages === 'string' ? tool.input.pages : ''

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5">
        {file && <span className="min-w-0 truncate font-['JetBrains_Mono','Fira_Code',monospace] text-[12px] font-bold text-[var(--accent-primary)]" title={file}>{file}</span>}
        {pages && <span className="shrink-0 whitespace-nowrap rounded-[5px] border border-[rgba(239,124,47,0.2)] bg-[rgba(239,124,47,0.1)] px-1.5 py-px text-[11px] font-semibold text-[var(--accent-primary)]">{pages.includes('-') ? `pages ${pages}` : `page ${pages}`}</span>}
      </div>

      {result?.content && !result.isError && (
        <Section label="Text read">
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
