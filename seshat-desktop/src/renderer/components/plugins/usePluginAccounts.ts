import { useCallback, useEffect, useState } from 'react'
import type { SystemStatus } from '@renderer/api/types'
import { api } from '@renderer/api/client'
import { connectorCatalog } from '@renderer/components/config/connectors/connectorCatalog'
import { fetchConnectorAccounts, fetchDriveAccounts } from '@renderer/components/config/connectors/connectorsApi'
import { fetchMCPServers } from '@renderer/components/config/mcp/mcpApi'
import type { MCPServer } from '@renderer/components/config/mcp/mcpTypes'
import { fetchMyConnectorAccounts } from './api/cloudConnectorsApi'
import { fetchInboxAccounts } from './api/inboxApi'
import type { PluginSource } from './catalog/pluginCatalog'
import type { PluginAccount } from './pluginsTypes'

export type PluginAccountsState = {
  loading: boolean
  // True on an organization account (connected to a Seshat Server).
  organization: boolean
  mcpServers: MCPServer[]
  accountsFor: (source: PluginSource) => PluginAccount[]
  reload: () => Promise<void>
}

type Loaded = {
  organization: boolean
  cloudByKind: Map<string, PluginAccount[]>
  inboxByChannel: Map<string, PluginAccount[]>
  knowledgeByKind: Map<string, PluginAccount[]>
  mcpServers: MCPServer[]
}

// Each source fails on its own: a local account has no organization
// connectors, and a backend still starting must not hide the rest.
async function safe<T>(load: Promise<T>, fallback: T): Promise<T> {
  try {
    return await load
  } catch {
    return fallback
  }
}

function group<T>(items: T[], keyOf: (item: T) => string, toAccount: (item: T) => PluginAccount) {
  const map = new Map<string, PluginAccount[]>()
  for (const item of items) {
    const key = keyOf(item)
    map.set(key, [...(map.get(key) ?? []), toAccount(item)])
  }
  return map
}

async function loadAll(): Promise<Loaded> {
  const status = await safe(api.get<SystemStatus>('/system/status'), { mode: 'standalone' } as SystemStatus)
  const organization = status.mode === 'connected'

  const [cloud, inbox, servers, ...knowledge] = await Promise.all([
    organization ? safe(fetchMyConnectorAccounts(), []) : Promise.resolve([]),
    safe(fetchInboxAccounts(), []),
    safe(fetchMCPServers(), []),
    ...connectorCatalog
      .filter((item) => item.category === 'Knowledge')
      .map((item) => safe(item.kind === 'gdrive' ? fetchDriveAccounts() : fetchConnectorAccounts(item.kind, item.accountPathKind), []))
  ])

  const knowledgeKinds = connectorCatalog.filter((item) => item.category === 'Knowledge').map((item) => item.kind)
  const knowledgeByKind = new Map<string, PluginAccount[]>()
  knowledge.forEach((accounts, index) => {
    knowledgeByKind.set(
      knowledgeKinds[index],
      accounts.map((account) => ({ id: account.id, label: account.display_name || account.external_account_id, status: account.status, lastError: account.last_error }))
    )
  })

  return {
    organization,
    cloudByKind: group(cloud, (a) => a.kind, (a) => ({ id: a.id, label: a.display_name, status: a.status, lastError: a.last_error })),
    inboxByChannel: group(inbox, (a) => a.channel, (a) => ({ id: a.id, label: a.display_name || a.external_account_id || a.channel, status: a.status, lastError: a.last_error })),
    knowledgeByKind,
    mcpServers: servers
  }
}

export function usePluginAccounts(): PluginAccountsState {
  const [data, setData] = useState<Loaded | null>(null)

  const reload = useCallback(async () => {
    setData(await loadAll())
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadAll().then((next) => { if (!cancelled) setData(next) })
    return () => { cancelled = true }
  }, [])

  const accountsFor = useCallback((source: PluginSource): PluginAccount[] => {
    if (!data) return []
    switch (source.type) {
      case 'cloud-oauth':
      case 'cloud-key':
        return data.cloudByKind.get(source.kind) ?? []
      case 'inbox-oauth':
        return data.inboxByChannel.get(source.channel) ?? []
      case 'whatsapp':
        return data.inboxByChannel.get('whatsapp') ?? []
      case 'knowledge':
        return data.knowledgeByKind.get(source.kind) ?? []
    }
  }, [data])

  return { loading: data === null, organization: data?.organization ?? false, mcpServers: data?.mcpServers ?? [], accountsFor, reload }
}
