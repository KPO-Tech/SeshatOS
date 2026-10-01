import { ErrorPre, Section } from '../common'
import { DiffView, resolveDiffRows } from '../DiffView'
import type { ToolViewProps } from '../types'

export function EditToolView({ tool, result, expanded }: ToolViewProps) {
  const filePath = (tool.input.file_path as string) ?? ''
  const diff = resolveDiffRows(tool)

  return (
    <>
      {diff && diff.rows.length > 0 && (
        <DiffView filePath={filePath} rows={diff.rows} addCount={diff.addCount} delCount={diff.delCount} expanded={expanded} />
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <ErrorPre content={result.content} />
        </Section>
      )}
    </>
  )
}
