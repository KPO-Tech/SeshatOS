import { useMemo } from 'react'
import { ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'
import { useTranslation } from 'react-i18next'

const NOTE_CSS = 'text-[12px] leading-[1.55] text-app-text-muted'
const CHIP_CSS = 'rounded-[3px] border border-app-border-subtle bg-[rgba(255,255,255,0.05)] px-[5px] py-0.5 font-mono'

type TtsResult = {
  provider?: string
  model?: string
  audio_base64?: string
  content_type?: string
  characters_used?: number
}

function parseTtsResult(content: string): TtsResult | null {
  try {
    return JSON.parse(content) as TtsResult
  } catch {
    return null
  }
}

export function TtsToolView({ tool, result }: ToolViewProps) {
  const { t } = useTranslation('chat')
  const text = typeof tool.input.text === 'string' ? tool.input.text : ''
  const voice = typeof tool.input.voice === 'string' ? tool.input.voice : ''

  const parsed = result?.content ? parseTtsResult(result.content) : null

  const audioSrc = useMemo(() => {
    if (!parsed?.audio_base64) return null
    const mime = parsed.content_type ?? 'audio/mpeg'
    return `data:${mime};base64,${parsed.audio_base64}`
  }, [parsed?.audio_base64, parsed?.content_type])

  return (
    <>
      {text && (
        <Section label={t('chat.tools.renderers.ttsToolView.text')}>
          <span className={NOTE_CSS}>{text.length > 200 ? `${text.slice(0, 200)}…` : text}</span>
        </Section>
      )}

      {result?.isError && result.content && (
        <Section label={t('chat.tools.renderers.ttsToolView.error')}>
          <ErrorPre content={result.content} />
        </Section>
      )}

      {audioSrc && (
        <Section label={t('chat.tools.renderers.ttsToolView.audio')}>
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              className="h-9 w-full rounded-md outline-none [accent-color:var(--accent-primary)] [&::-webkit-media-controls-panel]:bg-app-surface"
              controls
              src={audioSrc}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-app-text-muted">
              {parsed?.provider && <span className={CHIP_CSS}>{parsed.provider}</span>}
              {parsed?.model && <span className={CHIP_CSS}>{parsed.model}</span>}
              {voice && <span className={CHIP_CSS}>{t('chat.tools.renderers.ttsToolView.voice', { voice })}</span>}
              {parsed?.characters_used != null && (
                <span>{t('chat.tools.renderers.ttsToolView.chars', { value: parsed.characters_used.toLocaleString() })}</span>
              )}
            </div>
          </div>
        </Section>
      )}
    </>
  )
}
