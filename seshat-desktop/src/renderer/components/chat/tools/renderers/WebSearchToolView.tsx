import { useState } from 'react'
import { Search } from '@icon-park/react'
import { CodeBox, HCARD_HEADER_STAT_CSS, HeaderCard } from '../common'
import { fmtDuration, parseWebSearchHits } from '../helpers'
import type { ToolViewProps } from '../types'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@renderer/lib/openInAppBrowser'

const LINKS_CSS = '[scrollbar-width:thin] [scrollbar-color:var(--border-soft)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-app-border-subtle flex flex-col overflow-y-auto'
const LINKS_CSS_CAPPED = `${LINKS_CSS} max-h-[220px]`
const LINK_ITEM_CSS = 'flex items-center gap-2.5 border-0 border-b border-app-border-subtle px-2.5 py-2 no-underline transition-colors duration-150 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)]'
const LINK_FAVICON_CSS = 'inline-flex size-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--surface-panel)_74%,var(--surface-root))]'

export function WebSearchToolView({ tool, result, sessionId, expanded }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const hits = parseWebSearchHits(result?.content)
  const provider = result?.metadata?.provider != null ? String(result.metadata.provider) : ''
  const mode = result?.metadata?.mode != null ? String(result.metadata.mode) : ''
  const resultCount = result?.metadata?.result_count != null ? Number(result.metadata.result_count) : hits.length
  const duration = result?.durationMs != null ? fmtDuration(result.durationMs) : ''
  const countLabel = Number.isFinite(resultCount) && resultCount > 0
    ? `${resultCount} result${resultCount === 1 ? '' : 's'}`
    : ''
  const stat = [provider, mode, countLabel, duration].filter(Boolean).join(' · ')
  const [showAll, setShowAll] = useState(false)
  // Full-page inside Computer's Screen: every result, no soft cap - there's
  // room and its own scroll. Compact inline chat card: capped at 5 with a
  // "view all" toggle, same as before.
  const visibleHits = expanded || showAll ? hits : hits.slice(0, 5)
  const selectedCount = expanded ? hits.length : (showAll ? hits.length : Math.min(hits.length || resultCount || 0, 5))

  if (result?.isError) {
    return (
      <HeaderCard header={<span>{query || 'Web Search'}</span>}>
        {result.content && <CodeBox content={result.content} variant="error" bare />}
      </HeaderCard>
    )
  }

  return (
    <HeaderCard
      header={
        <>
          <span>{selectedCount || 'No'} selected result{selectedCount === 1 ? '' : 's'}</span>
          {stat && <span className={HCARD_HEADER_STAT_CSS}>{stat}</span>}
        </>
      }
    >
      {hits.length > 0 ? (
        <>
          <div className={expanded ? LINKS_CSS : LINKS_CSS_CAPPED}>
            {visibleHits.map((hit, index) => {
              const domain = domainLabel(hit.url)
              return (
                <a
                  key={`${hit.url}-${index}`}
                  className={LINK_ITEM_CSS}
                  href={hit.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (!shouldOpenInAppBrowser(event, hit.url)) return
                    event.preventDefault()
                    openInAppBrowser(hit.url, sessionId)
                  }}
                >
                  <Favicon domain={domain} fallback={sourceInitial(hit.title || domain)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12px] font-medium leading-[1.35] text-app-text">{hit.title || hit.url}</span>
                  </span>
                  <span className="max-w-[180px] shrink-0 truncate text-[11px] text-app-text-muted">{domain}</span>
                </a>
              )
            })}
          </div>
          {!expanded && hits.length > 5 && (
            <button
              type="button"
              className="flex w-full items-center border-0 border-t border-app-border-subtle bg-transparent pb-[9px] pl-[38px] pr-2.5 pt-2 text-left text-[11px] text-app-text-muted transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)] hover:text-app-text-secondary"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer sources' : `View all sources (${hits.length})`}
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-app-text-muted">
          <Search size={16} />
          <span className="text-[11.5px]">No results for this search.</span>
        </div>
      )}
    </HeaderCard>
  )
}

function Favicon({ domain, fallback }: { domain: string; fallback: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return <span className={`${LINK_FAVICON_CSS} bg-[color-mix(in_srgb,var(--accent-primary)_88%,black)] text-[9px] font-bold text-white`}>{fallback}</span>
  }
  return (
    <span className={LINK_FAVICON_CSS} aria-hidden="true">
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
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function sourceInitial(value: string): string {
  const first = value.trim().charAt(0)
  return first ? first.toUpperCase() : 'S'
}
