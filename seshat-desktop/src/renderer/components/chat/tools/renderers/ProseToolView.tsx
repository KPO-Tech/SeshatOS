import { ErrorPre, ProseBox, Section } from '../common'
import type { ToolViewProps } from '../types'

// Shared body for tools whose result is genuinely readable text (a feed of
// articles, a skill's markdown doc, a validation report) rather than data
// worth structuring further - the fix here isn't formatting fields, it's
// dropping GenericToolView's permanent raw `tool.input` JSON dump and
// showing the content as prose instead of a monospace code block.
export function ProseToolView({ result }: ToolViewProps) {
  if (result?.isError) {
    return result.content ? (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    ) : null
  }
  if (!result?.content) return null
  return (
    <Section label="Output">
      <ProseBox content={result.content} copyable />
    </Section>
  )
}
