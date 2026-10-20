import { fetchLocalConnectors } from '@renderer/components/plugins/api/localConnectorsApi'

// The runtime names the MCP server of a connector of the local catalog "connector-<kind>" (see Definition.ServerName in the backend).
const SERVER_PREFIX = 'connector-'

const labels = new Map<string, string>()
let loading: Promise<void> | null = null

/** The kind of the connector behind an MCP server name, or null when the server is not one of the local catalog's. */
export function connectorKind(server: string): string | null {
  return server.startsWith(SERVER_PREFIX) && server.length > SERVER_PREFIX.length ? server.slice(SERVER_PREFIX.length) : null
}

/** What to call an MCP server in the chat: a connector by its name ("GitHub"), any other server as it is configured. */
export function serverLabel(server: string): string {
  const kind = connectorKind(server)
  if (!kind) return server
  return labels.get(kind) ?? kind.charAt(0).toUpperCase() + kind.slice(1)
}

/** Reads the connectors' names from the backend once, so tool rows say "GitHub" and not "connector-github". */
export function loadConnectorLabels(): Promise<void> {
  loading ??= fetchLocalConnectors()
    .then((connectors) => {
      for (const connector of connectors) labels.set(connector.kind, connector.label)
    })
    .catch(() => {
      // The names fall back to the kind; try again on the next call.
      loading = null
    })
  return loading
}

/** For tests: sets the names without a backend. */
export function setConnectorLabels(entries: Record<string, string>) {
  labels.clear()
  for (const [kind, label] of Object.entries(entries)) labels.set(kind, label)
}
