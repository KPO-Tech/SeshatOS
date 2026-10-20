import type { LocalConnector } from './api/localConnectorsApi'
import { BrandIcon } from './catalog/BrandIcon'
import { categoryLabel } from './connectorGroups'
import { LocalConnectorPanel } from './panels/LocalConnectorPanel'

type Props = {
  connector: LocalConnector
  onChanged: () => void
  onClose: () => void
}

export function PluginDetailModal({ connector, onChanged, onClose }: Props) {
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
          <BrandIcon brand={connector.kind} title={connector.label} size={42} />
          <div className="min-w-0 pr-8">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{connector.label}</h2>
            <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--accent-primary)]">{categoryLabel(connector.category)}</div>
            <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]">{connector.description}</p>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] p-3.5">
            <LocalConnectorPanel connector={connector} onChanged={onChanged} />
          </section>
        </div>
      </div>
    </div>
  )
}
