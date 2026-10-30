import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import type { WebSource } from '@renderer/lib/webSources'
import { SiteIcon } from './SiteIcon'

function initialOf(source: WebSource): string {
  return (source.title || source.domain || 'S').trim().charAt(0).toUpperCase()
}

// The pages a paragraph cites, as one small chip at its end: the logo and the name of the first site, and how many other sites. Hovering
// it lists the pages; the text of each link in the paragraph stays a link of its own.
export function WebCitation({ sources, sessionId }: { sources: WebSource[]; sessionId?: string }) {
  const first = sources[0]
  if (!first) return null
  const otherSites = new Set(sources.map((source) => source.domain)).size - 1

  return (
    <span className="group/cite relative ml-1.5 inline-block align-[1px]">
      <button
        type="button"
        onClick={() => openInAppBrowser(first.url, sessionId)}
        className="inline-flex h-[18px] max-w-[130px] cursor-pointer items-center gap-[3px] rounded-full border border-solid border-[var(--border-soft)] bg-[var(--surface-muted)] py-0 pl-[3px] pr-1.5 text-[10.5px] font-medium leading-none text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <SiteIcon domain={first.domain} fallback={initialOf(first)} size={12} />
        <span className="truncate">{first.domain}</span>
        {otherSites > 0 && <span className="shrink-0 text-[var(--text-muted)]">+{otherSites}</span>}
      </button>

      <span className="absolute left-0 top-full z-30 hidden pt-1.5 group-focus-within/cite:block group-hover/cite:block">
        <span
          className="block w-[280px] overflow-hidden rounded-xl border border-solid border-[var(--border-soft)] bg-[var(--surface-menu)] shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
          style={{ animation: 'fade-in 140ms ease both' }}
        >
          {sources.map((source) => (
            <button
              key={source.url}
              type="button"
              onClick={() => openInAppBrowser(source.url, sessionId)}
              className="flex w-full cursor-pointer items-center gap-2.5 border-0 border-b border-solid border-[var(--border-soft)] bg-transparent px-3 py-2 text-left last:border-b-0 hover:bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)]"
            >
              <SiteIcon domain={source.domain} fallback={initialOf(source)} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--text-primary)]">{source.title || source.domain}</span>
                <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{source.domain}</span>
              </span>
            </button>
          ))}
        </span>
      </span>
    </span>
  )
}
