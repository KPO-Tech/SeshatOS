import { CodeBox, Section } from '../common'
import type { ToolViewProps } from '../types'

// Shared body for tools whose result content is a JSON blob meant to be read
// as data (memory graph nodes, automation job records) - pretty-printed
// instead of GenericToolView's raw single-line JSON plus a duplicate raw
// `tool.input` dump above it.
function prettify(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

export function JsonToolView({ result }: ToolViewProps) {
  if (!result?.content) return null
  return (
    <Section label={result.isError ? 'Error' : 'Result'}>
      <CodeBox
        content={prettify(result.content)}
        copyable
        // Syntax-highlighted like `| jq` in a terminal (colored keys/
        // strings/numbers) instead of a flat grey text dump - still just
        // Prism's JSON grammar, no actual jq involved.
        language={result.isError ? undefined : 'json'}
        variant={result.isError ? 'error' : undefined}
      />
    </Section>
  )
}
