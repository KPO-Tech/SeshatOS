import { useState } from 'react'
import { CONNECTOR_KIND_LABELS, MCP_BRIDGEABLE_OAUTH_KINDS, MCP_BRIDGEABLE_STATIC_KINDS, VENDOR_HOSTED_MCP_URL } from '@seshat/connector-catalog'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { createAdminMCPServerConfig, updateAdminMCPServerConfig, type AdminMCPServerConfigInput } from './useAdminMCPServerConfigs'
import type { AdminMCPServerConfig } from '../types'

const SERVER_TYPE_OPTIONS = ['stdio', 'http', 'sse', 'websocket']

// Each option has a genuine official MCP server from the vendor itself.
// Jira/Confluence share the same Atlassian Rovo endpoint, hence the label
// override rather than a generic connector name.
const LABEL_OVERRIDES: Partial<Record<string, string>> = { jira: 'Jira (Atlassian Rovo)', confluence: 'Confluence (Atlassian Rovo)' }

const CONNECTOR_KIND_OPTIONS = [
  { value: '', label: 'None (static config only)' },
  ...MCP_BRIDGEABLE_OAUTH_KINDS.map((kind) => ({ value: kind, label: LABEL_OVERRIDES[kind] ?? CONNECTOR_KIND_LABELS[kind] })),
  ...MCP_BRIDGEABLE_STATIC_KINDS.map((kind) => ({ value: kind, label: CONNECTOR_KIND_LABELS[kind] })),
]

export function MCPServerFormModal({ config, onClose, onSuccess }: { config: AdminMCPServerConfig | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(config?.name ?? '')
  const [displayName, setDisplayName] = useState(config?.display_name ?? '')
  const [serverType, setServerType] = useState(config?.server_type ?? 'http')
  const [command, setCommand] = useState(config?.command ?? '')
  const [argsText, setArgsText] = useState((config?.args ?? []).join('\n'))
  const [url, setUrl] = useState(config?.url ?? '')
  const [timeoutSecs, setTimeoutSecs] = useState(config?.timeout_secs ?? 30)
  const [connectorKind, setConnectorKind] = useState(config?.connector_kind ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isStdio = serverType === 'stdio'
  const isRemote = serverType === 'http' || serverType === 'sse' || serverType === 'websocket'

  function changeConnectorKind(value: string) {
    setConnectorKind(value)
    const vendorURL = VENDOR_HOSTED_MCP_URL[value as keyof typeof VENDOR_HOSTED_MCP_URL]
    if (vendorURL && !url) {
      setUrl(vendorURL)
      setServerType('http')
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const args = argsText.split(/\n|,/).map((a) => a.trim()).filter(Boolean)
      const params: AdminMCPServerConfigInput = {
        display_name: displayName || undefined,
        server_type: serverType,
        command: command || undefined,
        args,
        url: url || undefined,
        timeout_secs: timeoutSecs,
        connector_kind: connectorKind || undefined,
      }
      if (config) await updateAdminMCPServerConfig(config.id, params)
      else await createAdminMCPServerConfig({ ...params, name })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this MCP server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal
      title={config ? `Edit ${config.display_name || config.name}` : 'New MCP server'}
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || (!config && !name.trim())} onClick={handleSubmit}>{submitting ? 'Saving…' : 'Save'}</AdminModalButton>
        </>
      }
    >
      {!config && (
        <AdminModalField label="Name">
          <input type="text" className={adminInputClass} placeholder="internal-jira" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </AdminModalField>
      )}
      <AdminModalField label="Display name" hint="(optional)">
        <input type="text" className={adminInputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Server type">
        <select className={adminInputClass} value={serverType} onChange={(e) => setServerType(e.target.value)}>
          {SERVER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </AdminModalField>

      {isStdio && (
        <>
          <AdminModalField label="Command">
            <input type="text" className={adminInputClass} placeholder="npx" value={command} onChange={(e) => setCommand(e.target.value)} />
          </AdminModalField>
          <AdminModalField label="Arguments" hint="(one per line)">
            <textarea className={adminInputClass} rows={3} value={argsText} onChange={(e) => setArgsText(e.target.value)} />
          </AdminModalField>
        </>
      )}

      {isRemote && (
        <AdminModalField label="URL">
          <input type="text" className={adminInputClass} placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
        </AdminModalField>
      )}

      <AdminModalField label="Timeout (seconds)">
        <input type="number" min={1} className={adminInputClass} value={timeoutSecs} onChange={(e) => setTimeoutSecs(Number(e.target.value) || 30)} />
      </AdminModalField>

      <AdminModalField label="Bridged account" hint="(optional)">
        <select className={adminInputClass} value={connectorKind} onChange={(e) => changeConnectorKind(e.target.value)}>
          {CONNECTOR_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          When set, each member&apos;s own connected account is injected as a Bearer header when this server resolves.
        </p>
      </AdminModalField>

      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
