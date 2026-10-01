import { CodeBox, ErrorPre, Section } from '../common'
import type { ToolViewProps } from '../types'

const TARGET_CSS = 'flex items-center gap-1.5 overflow-hidden text-[11px] text-app-text'
const TARGET_URL_CSS = 'truncate font-mono'
const TARGET_PAGE_CSS = 'shrink-0 rounded-[3px] border border-app-border-subtle bg-[rgba(255,255,255,0.05)] px-1 py-px font-mono text-[9.5px] text-app-text-muted'
const IMG_WRAP_CSS = 'flex max-h-[480px] items-center justify-center overflow-hidden rounded-md border border-app-border-subtle bg-[rgba(0,0,0,0.12)]'

type ScreenshotResult = {
  page?: { id?: string; url?: string }
  mime_type?: string
  data_base64?: string
  bytes?: number
  full_page?: boolean
  persisted_path?: string
}

function parseScreenshotResult(content: string): ScreenshotResult | null {
  try {
    return JSON.parse(content) as ScreenshotResult
  } catch {
    return null
  }
}

// Best-effort "what is this action about" summary shown in the header row —
// browser_* tools each take a different primary argument (a URL, a snapshot
// element_id, a key, a scroll direction, ...), so there's no single field
// name that covers them all.
function browserTarget(tool: ToolViewProps['tool']): string | null {
  const input = tool.input
  const url = typeof input.url === 'string' ? input.url : ''
  if (url) return url
  const elementId = typeof input.element_id === 'string' ? input.element_id : ''
  const text = typeof input.text === 'string' ? input.text : ''
  if (elementId && text) return `${elementId} ← "${text}"`
  if (elementId) return elementId
  const key = typeof input.key === 'string' ? input.key : ''
  if (key) return `key: ${key}`
  const direction = typeof input.direction === 'string' ? input.direction : ''
  if (direction) return `scroll ${direction}`
  const query = typeof input.query === 'string' ? input.query : ''
  if (query) return query
  return null
}

export function BrowserToolView({ tool, result }: ToolViewProps) {
  const target = browserTarget(tool)
  const pageId = typeof tool.input.page_id === 'string' ? tool.input.page_id : ''

  if (!result || result.isError) {
    return (
      <>
        {(target || pageId) && (
          <div className={TARGET_CSS}>
            {target && <span className={TARGET_URL_CSS}>{target}</span>}
            {pageId && <span className={TARGET_PAGE_CSS}>{pageId}</span>}
          </div>
        )}
        {result?.isError && result.content && (
          <Section label="Error"><ErrorPre content={result.content} /></Section>
        )}
      </>
    )
  }

  if (tool.name === 'browser_screenshot') {
    const parsed = parseScreenshotResult(result.content)
    const src = parsed?.data_base64
      ? `data:${parsed.mime_type ?? 'image/png'};base64,${parsed.data_base64}`
      : null
    return (
      <>
        <div className={TARGET_CSS}>
          {parsed?.page?.url && <span className={TARGET_URL_CSS}>{parsed.page.url}</span>}
          {parsed?.page?.id && <span className={TARGET_PAGE_CSS}>{parsed.page.id}</span>}
        </div>
        {src ? (
          <Section label={parsed?.full_page ? 'Full page' : 'Viewport'}>
            <div className={IMG_WRAP_CSS}>
              <img className="block h-auto max-h-[480px] w-full object-contain" src={src} alt={parsed?.page?.url ?? 'Browser screenshot'} loading="lazy" />
            </div>
          </Section>
        ) : (
          <Section label="Result"><CodeBox content={result.content} /></Section>
        )}
      </>
    )
  }

  return (
    <>
      {(target || pageId) && (
        <div className={TARGET_CSS}>
          {target && <span className={TARGET_URL_CSS}>{target}</span>}
          {pageId && <span className={TARGET_PAGE_CSS}>{pageId}</span>}
        </div>
      )}
      {result.content && (
        <Section label="Result">
          <CodeBox content={result.content} copyable />
        </Section>
      )}
    </>
  )
}
