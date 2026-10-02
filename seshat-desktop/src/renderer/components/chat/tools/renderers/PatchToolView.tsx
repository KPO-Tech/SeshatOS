import { ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'

const PATCH_LINE_CSS = 'rounded-[5px] px-2 py-[3px] font-[\'JetBrains_Mono\',\'Fira_Code\',monospace] text-[12px] text-app-text-secondary'

const VERB_CLASS: Record<string, string> = {
  Added: 'text-[var(--accent-success)]',
  Deleted: 'text-[var(--accent-danger)]',
  Updated: 'text-[var(--accent-primary)]',
  Moved: 'text-app-text-muted',
}

// apply_patch's result content is already a clean one-line-per-file summary
// ("Added: path", "Deleted: path", "Updated: path", "Moved: a → b") - just
// needs each line color-coded by verb instead of being dumped as one grey
// monospace blob under a raw JSON "Input" section.
export function PatchToolView({ result }: ToolViewProps) {
  if (result?.isError) {
    return result.content ? (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    ) : null
  }
  const lines = (result?.content ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <Section label="Changes">
      <div className="flex flex-col gap-[3px] rounded-lg border border-app-border-subtle bg-[rgba(0,0,0,0.2)] p-1">
        {lines.map((line, i) => {
          const verb = line.split(':')[0]?.trim() ?? ''
          const cls = VERB_CLASS[verb] ?? ''
          return <div key={i} className={`${PATCH_LINE_CSS} ${cls}`}>{line}</div>
        })}
      </div>
    </Section>
  )
}
