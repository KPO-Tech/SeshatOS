import { LinkOne } from '@icon-park/react'
import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import { sourceLabel } from '@renderer/lib/sourceLink'

/** The address of where something comes from (a repository, a page), as a small link that opens it. */
export function SourceLink({ url, label, className = '' }: { url: string; label?: string; className?: string }) {
  return (
    <button
      type="button"
      title={url}
      onClick={(event) => {
        event.stopPropagation()
        openInAppBrowser(url)
      }}
      className={`flex min-w-0 max-w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-[11.5px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:underline ${className}`}
    >
      <LinkOne theme="outline" size={12} className="shrink-0" />
      <span className="truncate">{label ?? sourceLabel(url)}</span>
    </button>
  )
}
