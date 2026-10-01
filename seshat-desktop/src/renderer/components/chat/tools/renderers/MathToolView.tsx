import { CodeBox, HeaderCard } from '../common'
import type { ToolViewProps } from '../types'

function str(tool: ToolViewProps['tool'], key: string): string {
  return typeof tool.input[key] === 'string' ? (tool.input[key] as string) : ''
}

// Shared body for calculator/unit_convert/statistics/financial_calc - all
// four take a short expression/operation and return a result (a bare number,
// or pretty-printed JSON for the richer stats/financial ops). Showing just
// that pair beats GenericToolView's full raw-args JSON dump for what's
// usually a one-line question and answer.
export function MathToolView({ tool, result }: ToolViewProps) {
  const expression = str(tool, 'expression') || str(tool, 'operation')
  if (!result?.content) return null
  return (
    <HeaderCard header={<span title={expression}>{expression || 'Result'}</span>}>
      <CodeBox content={result.content} copyable bare variant={result.isError ? 'error' : undefined} />
    </HeaderCard>
  )
}
