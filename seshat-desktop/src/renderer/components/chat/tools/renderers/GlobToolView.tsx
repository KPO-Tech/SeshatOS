import { ErrorPre, FILEPATH_CSS, FILE_ITEM_CSS, FILE_LIST_CSS, HCARD_HEADER_PATH_CSS, HCARD_HEADER_STAT_CSS, HeaderCard, Section } from '../common'
import type { ToolViewProps } from '../types'

export function GlobToolView({ tool, result }: ToolViewProps) {
  const pattern = (tool.input.pattern as string) ?? ''
  const path = (tool.input.path as string) ?? ''
  // Only treat content as a file list on success - on error, result.content
  // is the error message text (e.g. "ripgrep not found\nOr run: ..."),
  // which used to get split into lines and shown as fake "2 matches"
  // alongside the real Error section right below it.
  // The backend's own message is "Found N file(s) in Xms\n<path>\n<path>...":
  // a summary line first, then one path per line (seshat/internal/tools/files/glob/utils.go,
  // formatGlobResult) - drop that first line, it isn't a file and was
  // rendering as a bogus extra match.
  const files = result?.content && !result.isError
    ? result.content.split('\n').slice(1).map((f) => f.trim()).filter(Boolean)
    : []

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    )
  }

  return (
    <HeaderCard
      header={
        <>
          <span>{pattern}</span>
          {path && <span className={HCARD_HEADER_PATH_CSS}>{path}</span>}
          <span className={HCARD_HEADER_STAT_CSS}>
            {files.length} match{files.length !== 1 ? 'es' : ''}
          </span>
        </>
      }
    >
      {files.length > 0 ? (
        <div className={FILE_LIST_CSS}>
          {files.map((file, i) => (
            <div key={i} className={FILE_ITEM_CSS}>{file}</div>
          ))}
        </div>
      ) : (
        <span className={FILEPATH_CSS}>No matches found.</span>
      )}
    </HeaderCard>
  )
}
