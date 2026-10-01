import { BrandIcon } from './catalog/BrandIcon'
import { PLUGIN_CATEGORIES, availableSources, type PluginDefinition } from './catalog/pluginCatalog'
import { SourcePanel } from './SourcePanel'
import type { PluginAccountsState } from './usePluginAccounts'

type Props = {
  plugin: PluginDefinition
  state: PluginAccountsState
  onClose: () => void
}

export function PluginDetailModal({ plugin, state, onClose }: Props) {
  const sources = availableSources(plugin, state.organization)
  const category = PLUGIN_CATEGORIES.find((item) => item.id === plugin.category)?.label

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="relative flex max-h-[85vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>

        <div className="flex items-start gap-3.5 border-b border-[var(--border-soft)] px-5 pb-4 pt-5">
          <BrandIcon brand={plugin.brand} title={plugin.title} size={42} />
          <div className="min-w-0 pr-8">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{plugin.title}</h2>
            {category && <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--accent-primary)]">{category}</div>}
            <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]">{plugin.description}</p>
          </div>
        </div>

        <div className="no-scrollbar grid min-h-0 flex-1 gap-2.5 overflow-y-auto px-5 py-4">
          {sources.map((source, index) => (
            <SourcePanel
              key={`${source.type}-${index}`}
              plugin={plugin}
              source={source}
              accounts={state.accountsFor(source)}
              onChanged={() => void state.reload()}
              onClose={onClose}
            />
          ))}
          {!state.organization && plugin.sources.some((source) => source.type === 'cloud-oauth' || source.type === 'cloud-key') && (
            <p className="text-[11.5px] leading-5 text-[var(--text-muted)]">
              Organization accounts (for agents and automations on Seshat Server) appear here once this workspace is connected to a server.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
