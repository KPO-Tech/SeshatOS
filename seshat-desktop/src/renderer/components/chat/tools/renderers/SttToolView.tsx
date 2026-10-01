import { ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'

const CHIP_CSS = 'rounded-[3px] border border-app-border-subtle bg-[rgba(255,255,255,0.05)] px-[5px] py-0.5 font-mono'

type SttResult = {
  text?: string
  language?: string
  duration?: number
}

function parseSttResult(content: string): SttResult | null {
  try {
    return JSON.parse(content) as SttResult
  } catch {
    return { text: content }
  }
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export function SttToolView({ result }: ToolViewProps) {
  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    )
  }

  if (!result?.content) return null

  const parsed = parseSttResult(result.content)
  const transcript = parsed?.text ?? result.content

  return (
    <>
      <Section label="Transcript">
        <div className="whitespace-pre-wrap rounded-md border border-app-border-subtle bg-[rgba(255,255,255,0.03)] px-2 py-[7px] text-[12px] leading-[1.65] text-app-text">{transcript}</div>
      </Section>

      {(parsed?.language || parsed?.duration != null) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-app-text-muted">
          {parsed.language && <span className={CHIP_CSS}>{parsed.language}</span>}
          {parsed.duration != null && (
            <span>{formatDuration(parsed.duration)}</span>
          )}
        </div>
      )}
    </>
  )
}
