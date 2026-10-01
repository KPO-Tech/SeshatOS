import { ErrorPre, Section } from '../common'
import { DiffView, resolveDiffRows } from '../DiffView'
import type { ToolViewProps } from '../types'

// Note: for write_file/edit_file specifically, ToolLineItem.tsx renders its
// own DiffContent instead of dispatching here (isDiffTool skips
// renderToolBody entirely) - see the HTML-preview button there, not here.
// This component still backs the registry entry for other consumers of
// renderToolBody (e.g. a future non-diff surface), so it's kept correct on
// its own rather than deleted.
export function WriteToolView({ tool, result, expanded }: ToolViewProps) {
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
