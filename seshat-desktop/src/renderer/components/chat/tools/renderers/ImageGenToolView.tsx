import { ErrorPre, Section } from '../common'
import { useUIStore } from '@renderer/stores/ui'
import type { ToolViewProps } from '../types'

const NOTE_CSS = 'text-[12px] leading-[1.55] text-app-text-muted'
const CHIP_CSS = 'rounded-[3px] border border-app-border-subtle bg-[rgba(255,255,255,0.05)] px-[5px] py-0.5 font-mono'

type ImageResult = {
  provider?: string
  model?: string
  image_base64?: string
  image_url?: string
  mime_type?: string
  revised_prompt?: string
}

function parseImageResult(content: string): ImageResult | null {
  try {
    return JSON.parse(content) as ImageResult
  } catch {
    return null
  }
}

export function ImageGenToolView({ tool, result }: ToolViewProps) {
  const openLightbox = useUIStore((s) => s.openLightbox)
  const prompt = typeof tool.input.prompt === 'string' ? tool.input.prompt : ''

  if (!result || result.isError) {
    return (
      <>
        {prompt && <Section label="Prompt"><span className={NOTE_CSS}>{prompt}</span></Section>}
        {result?.isError && result.content && (
          <Section label="Error"><ErrorPre content={result.content} /></Section>
        )}
      </>
    )
  }

  const parsed = parseImageResult(result.content)

  const src = parsed?.image_base64
    ? `data:${parsed.mime_type ?? 'image/png'};base64,${parsed.image_base64}`
    : parsed?.image_url ?? null

  const originalPrompt = prompt
  const revisedPrompt = parsed?.revised_prompt
  const promptChanged = revisedPrompt && revisedPrompt !== originalPrompt

  return (
    <>
      {prompt && (
        <Section label="Prompt">
          <span className={NOTE_CSS}>{prompt}</span>
        </Section>
      )}

      {promptChanged && (
        <Section label="Revised prompt">
          <span className="text-[10px] italic leading-[1.5] text-app-text-muted">{revisedPrompt}</span>
        </Section>
      )}

      {src && (
        <Section label="Result">
          <div className="flex max-h-[480px] items-center justify-center overflow-hidden rounded-md border border-app-border-subtle bg-[rgba(0,0,0,0.12)]">
            <img
              className="block h-auto max-h-[480px] w-full cursor-zoom-in object-contain"
              src={src}
              alt={revisedPrompt ?? prompt}
              loading="lazy"
              onClick={() => openLightbox({ url: src, filename: `${(revisedPrompt ?? prompt ?? 'generated-image').slice(0, 60)}.png` })}
            />
          </div>
        </Section>
      )}

      {parsed && (parsed.provider || parsed.model) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-app-text-muted">
          {parsed.provider && <span className={CHIP_CSS}>{parsed.provider}</span>}
          {parsed.model && <span className={CHIP_CSS}>{parsed.model}</span>}
        </div>
      )}
    </>
  )
}
