import { CodeBox, Section } from '../common'
import type { ToolViewProps } from '../types'

// Detects genuine JSON content (result.content for tools with no dedicated
// renderer can be JSON, prose, or a log dump - only pretty-print/colorize
// when it actually parses) and re-serializes it indented, same treatment
// JsonToolView gives its own tools.
function jsonOrRaw(content: string): { text: string; isJson: boolean } {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return { text: content, isJson: false }
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true }
  } catch {
    return { text: content, isJson: false }
  }
}

export function GenericToolView({ tool, result }: ToolViewProps) {
  const inputStr = JSON.stringify(tool.input, null, 2)
  const output = result?.content ? jsonOrRaw(result.content) : null
  const metadataStr = result?.metadata ? JSON.stringify(result.metadata, null, 2) : ''

  return (
    <>
      <Section label="Input">
        <CodeBox content={inputStr} language="json" />
      </Section>

      {output && (
        <Section label="Output">
          <CodeBox content={output.text} copyable language={output.isJson ? 'json' : undefined} />
        </Section>
      )}

      {!result?.content && metadataStr && (
        <Section label="Details">
          <CodeBox content={metadataStr} copyable language="json" />
        </Section>
      )}
    </>
  )
}
