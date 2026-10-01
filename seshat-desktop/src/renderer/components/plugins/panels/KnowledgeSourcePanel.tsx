import { useDialogsStore } from '@renderer/stores/dialogs'
import { isHealthy, type PluginAccount } from '../pluginsTypes'

// Knowledge sources (Drive, SharePoint, S3) are synced into a corpus, which is
// configured in Config > Connectors, so this panel only summarizes and links.
export function KnowledgeSourcePanel({ accounts, onClose }: { accounts: PluginAccount[]; onClose: () => void }) {
  const openConfig = useDialogsStore((state) => state.openConfig)
  return (
    <div className="grid gap-3">
      {accounts.length > 0 && (
        <ul className="grid gap-1.5 text-[12px] text-[var(--text-secondary)]">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-2">
              <span className={['size-1.5 rounded-full', isHealthy(account) ? 'bg-[var(--accent-success)]' : 'bg-[var(--accent-danger)]'].join(' ')} />
              {account.label}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={() => {
            onClose()
            openConfig('connectors')
          }}
          className="h-8 rounded-lg border border-[var(--border-soft)] px-3.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
        >
          {accounts.length > 0 ? 'Manage in Config' : 'Set up in Config'}
        </button>
      </div>
    </div>
  )
}
