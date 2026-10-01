import { CodeBox, ErrorPre, HCARD_HEADER_PATH_CSS, HeaderCard, Section } from '../common'
import type { ToolViewProps } from '../types'

export function GrepToolView({ tool, result }: ToolViewProps) {
  const pattern = (tool.input.pattern as string) ?? ''
  const path = (tool.input.path as string) ?? ''
  const include = (tool.input.include as string) ?? ''

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    )
  }

  if (!result?.content) return null

  return (
    <HeaderCard
      header={
        <>
          <span>{pattern}</span>
          {include && <span className={HCARD_HEADER_PATH_CSS}>{include}</span>}
          {path && <span className={HCARD_HEADER_PATH_CSS}>{path}</span>}
        </>
      }
    >
      <CodeBox content={result.content} copyable bare />
    </HeaderCard>
  )
}
