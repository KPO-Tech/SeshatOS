import type { MCPServer, MCPServerFormValues } from './mcpTypes'

export function valuesFromServer(server?: MCPServer): MCPServerFormValues {
  return {
    name: server?.name ?? '',
    display_name: server?.display_name ?? '',
    server_type: server?.server_type ?? 'stdio',
    command: server?.command ?? '',
    args: (server?.args ?? []).join('\n'),
    env: mapToLines(server?.env),
    url: server?.url ?? '',
    headers: mapToLines(server?.headers),
    timeout_secs: server?.timeout_secs ?? 30,
    icon: server?.icon ?? ''
  }
}

export function formValuesToPayload(values: MCPServerFormValues, server?: MCPServer): Partial<MCPServer> {
  const type = values.server_type
  return {
    id: server?.id,
    name: values.name.trim(),
    display_name: values.display_name.trim(),
    server_type: type,
    command: type === 'stdio' ? values.command.trim() : '',
    args: type === 'stdio' ? linesToList(values.args) : [],
    env: type === 'stdio' ? linesToMap(values.env) : {},
    url: type !== 'stdio' ? values.url.trim() : '',
    headers: type !== 'stdio' ? linesToMap(values.headers) : {},
    timeout_secs: Number(values.timeout_secs) || 30,
    icon: values.icon.trim(),
    enabled: server?.enabled ?? true
  }
}

export function validateMCPForm(values: MCPServerFormValues) {
  if (!values.name.trim()) return 'Name is required.'
  if (values.server_type === 'stdio' && !values.command.trim()) return 'Command is required for stdio servers.'
  if (values.server_type !== 'stdio' && !values.url.trim()) return 'URL is required for network servers.'
  return null
}

function linesToList(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function linesToMap(raw: string) {
  const result: Record<string, string> = {}
  raw.split('\n').forEach((line) => {
    const index = line.indexOf('=')
    if (index <= 0) return
    result[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  })
  return result
}

function mapToLines(map?: Record<string, string>) {
  return Object.entries(map ?? {}).map(([key, value]) => `${key}=${value}`).join('\n')
}
