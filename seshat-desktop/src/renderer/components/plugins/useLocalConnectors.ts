import { useCallback, useEffect, useState } from 'react'
import { fetchMCPServers } from '@renderer/components/config/mcp/mcpApi'
import type { MCPServer } from '@renderer/components/config/mcp/mcpTypes'
import { fetchLocalConnectors, type LocalConnector } from './api/localConnectorsApi'

export type LocalConnectorsState = {
  loading: boolean
  connectors: LocalConnector[]
  mcpServers: MCPServer[]
  reload: () => Promise<void>
}

// Each list fails on its own: a backend still starting must not hide the other.
async function safe<T>(load: Promise<T>, fallback: T): Promise<T> {
  try {
    return await load
  } catch {
    return fallback
  }
}

async function loadAll() {
  const [connectors, mcpServers] = await Promise.all([safe(fetchLocalConnectors(), []), safe(fetchMCPServers(), [])])
  return { connectors, mcpServers }
}

export function useLocalConnectors(): LocalConnectorsState {
  const [data, setData] = useState<{ connectors: LocalConnector[]; mcpServers: MCPServer[] } | null>(null)

  const reload = useCallback(async () => {
    setData(await loadAll())
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadAll().then((next) => { if (!cancelled) setData(next) })
    return () => { cancelled = true }
  }, [])

  return { loading: data === null, connectors: data?.connectors ?? [], mcpServers: data?.mcpServers ?? [], reload }
}
