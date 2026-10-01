import { useState } from 'react'
import { CodeBox, HCARD_HEADER_STAT_CSS, HeaderCard, ProseBox } from '../common'
import type { ToolViewProps } from '../types'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@renderer/lib/openInAppBrowser'

const FAVICON_CSS = 'inline-flex size-[15px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-surface)_74%,var(--color-bg))]'
const HOSTNAME_LINK_CSS = 'min-w-0 shrink truncate text-app-text no-underline hover:text-[var(--color-accent)] hover:underline'

export function WebFetchToolView({ tool, result, sessionId, expanded }: ToolViewProps) {
  const url = (tool.input.url as string) ?? ''
  const prompt = (tool.input.prompt as string) ?? ''
  const hostname = domainLabel(url)

  const parsed = parseFetchResult(result?.content ?? '')
  const status = parsed.status || (result?.isError ? 'Error' : '')
  const size = formatBytes(parsed.sizeBytes)
  const duration = parsed.time || (result?.durationMs != null ? `${result.durationMs}ms` : '')
  const stat = [status, parsed.mode, size, duration].filter(Boolean).join(' · ')
  const sourceUrl = parsed.fetchedFrom || url

  if (result?.isError) {
    return (
      <HeaderCard
        header={
          <>
            <span className="truncate">{hostname || 'Web Fetch'}</span>
            {stat && <span className={HCARD_HEADER_STAT_CSS}>{stat}</span>}
          </>
        }
      >
        {result.content && <CodeBox content={result.content} variant="error" bare />}
      </HeaderCard>
    )
  }

  // The header used to be one giant clickable URL spanning the whole strip -
  // a favicon-sized hostname link plus a stat, matching every other
  // HeaderCard's header, leaves the actual space for the extracted content
  // below instead of the source address.
  return (
    <HeaderCard
      header={
        <>
          <Favicon domain={hostname} />
          {sourceUrl ? (
            <a
              className={HOSTNAME_LINK_CSS}
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (!shouldOpenInAppBrowser(event, sourceUrl)) return
                event.preventDefault()
                openInAppBrowser(sourceUrl, sessionId)
              }}
            >
              {hostname || sourceUrl}
            </a>
          ) : (
            <span className="truncate">Web Fetch</span>
          )}
          {stat && <span className={HCARD_HEADER_STAT_CSS}>{stat}</span>}
        </>
      }
    >
      <div className="flex flex-col gap-1.5 px-2.5 py-2">
        {prompt && <p className="m-0 text-[10.5px] italic leading-[1.4] text-app-text-muted">&ldquo;{prompt}&rdquo;</p>}
        {parsed.content ? (
          <ProseBox content={parsed.content} copyable bare expanded={expanded} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-app-text-muted">
            <span className="text-[11.5px]">No content extracted.</span>
          </div>
        )}
      </div>
    </HeaderCard>
  )
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) return null
  return (
    <span className={FAVICON_CSS} aria-hidden="true">
      <img
        className="block size-full object-cover"
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function domainLabel(url: string): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return url
  }
}

function parseFetchResult(content: string) {
  const lines = content.split(/\r?\n/)
  const meta = {
    fetchedFrom: '',
    mode: '',
    status: '',
    sizeBytes: undefined as number | undefined,
    time: '',
    content: content.trim(),
  }

  let resultIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (/^Result:\s*$/i.test(line)) {
      resultIndex = i
      break
    }
    const match = line.match(/^([A-Za-z ]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (key === 'fetched from') meta.fetchedFrom = value
    if (key === 'mode') meta.mode = value
    if (key === 'status') meta.status = value
    if (key === 'time') meta.time = value
    if (key === 'size') {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed)) meta.sizeBytes = parsed
    }
  }

  if (resultIndex >= 0) {
    meta.content = lines.slice(resultIndex + 1).join('\n').trim()
  }
  meta.content = meta.content.replace(/^Processed preapproved content for prompt:\s*.*?\n+/is, '').trim()
  return meta
}

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
