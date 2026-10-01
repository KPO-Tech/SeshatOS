import { CodeBox, ErrorPre, HCARD_HEADER_STAT_CSS, HeaderCard, Section } from '../common'
import { languageForPath, basename, parseReadToolContent } from '../helpers'
import type { ToolViewProps } from '../types'

function rangeLabel(offset?: number, limit?: number): string {
  if (offset != null && limit != null) return `lines ${offset + 1}–${offset + limit}`
  if (offset != null) return `from line ${offset + 1}`
  if (limit != null) return `first ${limit} lines`
  return ''
}

export function ReadToolView({ tool, result, expanded }: ToolViewProps) {
  const filePath = (tool.input.file_path as string) ?? ''
  const offset = tool.input.offset as number | undefined
  const limit = tool.input.limit as number | undefined
  const range = rangeLabel(offset, limit)

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    )
  }

  if (!result?.content) return null

  const parsed = parseReadToolContent(result.content)

  const code = (
    <CodeBox
      content={parsed.text}
      copyable
      language={languageForPath(filePath)}
      lineNumbers
      startingLineNumber={parsed.startLine ?? (offset != null ? offset + 1 : 1)}
      bare={!expanded}
      expanded={expanded}
    />
  )

  // Full-page inside Computer/Files: the host already shows the filename in
  // its own header (Files' merged title row, Computer's focused-tool strip)
  // - a second HeaderCard repeating it here just for a "lines x-y" stat was
  // three copies of the same filename on screen at once, and its 220px cap
  // was fighting the whole point of a dedicated full-page file view.
  if (expanded) return code

  return (
    <HeaderCard
      header={
        <>
          <span title={filePath}>{basename(filePath)}</span>
          {range && <span className={HCARD_HEADER_STAT_CSS}>{range}</span>}
        </>
      }
    >
      {code}
    </HeaderCard>
  )
}
