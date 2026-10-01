import { useState } from 'react'
import { Edit } from '@icon-park/react'
import { OAUTH_CONNECTOR_KINDS, CONNECTOR_KIND_LABELS } from '@seshat/connector-catalog'
import { BrandIcon } from '@renderer/components/plugins/catalog/BrandIcon'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminCard, AdminCardGrid } from '../shared/AdminCard'
import { AdminIconButton } from '../shared/AdminTable'
import { ConnectorFormModal } from './ConnectorFormModal'
import { useAdminConnectorOAuthApps } from './useAdminConnectorOAuthApps'

export function ConnectorsView() {
  const { apps, loading, error, refetch } = useAdminConnectorOAuthApps()
  const [configuring, setConfiguring] = useState<{ kind: string; label: string } | null>(null)
  const appByKind = new Map(apps.map((a) => [a.kind, a]))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 text-[17px] font-semibold text-[var(--text-primary)]">Connectors</div>
      <p className="mb-4 text-[12px] text-[var(--text-muted)]">
        Register this organization&apos;s own OAuth app once per service - every employee&apos;s own "Connect" click authenticates against it.
      </p>

      {error && <AdminBanner message={error} />}

      {loading ? (
        <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
      ) : (
        <AdminCardGrid>
          {OAUTH_CONNECTOR_KINDS.map((kind) => {
            const label = CONNECTOR_KIND_LABELS[kind]
            const app = appByKind.get(kind)
            return (
              <AdminCard
                key={kind}
                icon={<BrandIcon brand={kind} title={label} size={32} />}
                title={label}
                subtitle={kind}
                configured={!!app?.configured}
                actions={
                  app?.configured ? (
                    <AdminIconButton label="Edit" onClick={() => setConfiguring({ kind, label })}><Edit size={14} /></AdminIconButton>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfiguring({ kind, label })}
                      className="cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-2.5 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                    >
                      Configure
                    </button>
                  )
                }
              />
            )
          })}
        </AdminCardGrid>
      )}

      {configuring && (
        <ConnectorFormModal
          kind={configuring.kind}
          label={configuring.label}
          existing={appByKind.get(configuring.kind)}
          onClose={() => setConfiguring(null)}
          onSuccess={() => { setConfiguring(null); void refetch() }}
        />
      )}
    </div>
  )
}
