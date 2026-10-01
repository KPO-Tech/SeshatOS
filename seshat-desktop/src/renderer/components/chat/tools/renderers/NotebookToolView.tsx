import { CodeBox, ErrorPre, HCARD_HEADER_PATH_CSS, HeaderCard, ProseBox, Section } from '../common'
import { basename } from '../helpers'
import type { ToolViewProps } from '../types'

function notebookPath(input: Record<string, unknown>): string {
  return typeof input.notebook_path === 'string'
    ? input.notebook_path
    : typeof input.path === 'string'
      ? input.path
      : typeof input.file_path === 'string'
        ? input.file_path
        : ''
}

function actionLabel(name: string): string {
  return name
    .replace(/^notebook_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function looksStructured(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

export function NotebookToolView({ tool, result }: ToolViewProps) {
  const path = notebookPath(tool.input)
  const title = path ? basename(path) : 'Notebook'
  const action = actionLabel(tool.name)

  if (result?.isError) {
    return result.content ? (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    ) : null
  }

  if (!result?.content) return null

  return (
    <HeaderCard
      header={
        <>
          <span title={path || title}>{title}</span>
          <span className={HCARD_HEADER_PATH_CSS}>{action}</span>
        </>
      }
    >
      {looksStructured(result.content) ? (
        <CodeBox content={result.content} language="json" copyable bare />
      ) : (
        <ProseBox content={result.content} copyable bare />
      )}
    </HeaderCard>
  )
}
