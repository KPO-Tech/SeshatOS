import { Right, Search } from '@icon-park/react'
import { useState } from 'react'
import { filterTools, hasToolDetails, toolSummary, toolTextBlocks } from './mcpToolText'
import type { MCPToolEntry } from './mcpTypes'
import { useTranslation } from 'react-i18next'

// Past this many tools the list can be searched.
const SEARCH_FROM = 6

function ToolRow({ tool }: { tool: MCPToolEntry }) {
  const [open, setOpen] = useState(false)
  const summary = toolSummary(tool.description)
  const opens = hasToolDetails(tool.description)
  const head = (
    <>
      <Right size={12} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''} ${opens ? '' : 'invisible'}`} />
      <span className="shrink-0 font-mono text-[12px] font-semibold text-[var(--text-primary)]">{tool.name}</span>
      {!open && summary && <span className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">{summary}</span>}
    </>
  )
  return (
    <li>
      {opens ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{head}</div>
      )}
      {open && (
        <div className="grid max-h-80 gap-1.5 overflow-y-auto pr-3 pb-3 pl-8">
          {toolTextBlocks(tool.description).map((block, index) =>
            block.kind === 'code' ? (
              <code key={index} className="block rounded-md bg-[var(--surface-muted)] px-2 py-1.5 font-mono text-[11px] break-all text-[var(--text-secondary)]">
                {block.value}
              </code>
            ) : (
              <p key={index} className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                {block.value}
              </p>
            )
          )}
        </div>
      )}
    </li>
  )
}

/** The tools of a server, one line each: a description is written for the model, and opens on demand. */
export function MCPToolList({ tools }: { tools?: MCPToolEntry[] }) {
  const { t } = useTranslation('config')
  const [query, setQuery] = useState('')
  if (!tools || tools.length === 0) {
    return <div className="px-4 py-3 text-[12px] text-[var(--text-muted)]">{t('mcp.mCPToolList.noToolsYetApplyAnd')}</div>
  }
  const shown = filterTools(tools, query)
  return (
    <div className="grid gap-2 px-4 py-3">
      {tools.length >= SEARCH_FROM && (
        <label className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] px-3 py-1.5">
          <Search size={13} className="text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('mcp.mcpToolList.search', { count: tools.length })}
            aria-label={t('mcp.mCPToolList.searchTheTools')}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>
      )}
      {shown.length > 0 ? (
        <ul className="divide-y divide-[var(--border-soft)] overflow-hidden rounded-lg border border-[var(--border-soft)]">
          {shown.map((tool) => (
            <ToolRow key={tool.name} tool={tool} />
          ))}
        </ul>
      ) : (
        <div className="px-1 text-[12px] text-[var(--text-muted)]">{t('mcp.mCPToolList.noToolMatchesThisSearch')}</div>
      )}
    </div>
  )
}
