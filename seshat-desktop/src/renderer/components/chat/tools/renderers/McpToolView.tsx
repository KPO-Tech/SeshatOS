import { CodeBox, ErrorPre, HCARD_HEADER_PATH_CSS, HeaderCard, Section } from '../common'
import type { ToolViewProps } from '../types'

type ParsedMcpName = { server: string; tool: string }

// MCP tools reach the client under two different naming shapes:
//  - the common one: each MCP tool is individually registered as
//    "mcp__<server>__<tool>" (see MCPToolPrefix in the engine) — the
//    server/tool split is entirely in the name.
//  - the generic fallback "mcp" tool, invoked with a `tool`/`_tool` input
//    field carrying the same "mcp__server__tool" string (and sometimes a
//    separate `server`/`_server` field) — see mcp/tool.go's Call().
// Without unpacking this, the default label renderer turns the double
// underscores into double spaces ("mcp  github  search issues"), which is
// illegible and doesn't distinguish the server from the tool at all.
function parseMcpToolName(name: string, input: Record<string, unknown>): ParsedMcpName | null {
  const splitDynamicName = (dynamicName: string): ParsedMcpName => {
    const rest = dynamicName.slice('mcp__'.length)
    const sepIndex = rest.indexOf('__')
    return sepIndex >= 0
      ? { server: rest.slice(0, sepIndex), tool: rest.slice(sepIndex + 2) }
      : { server: '', tool: rest }
  }

  if (name.startsWith('mcp__')) return splitDynamicName(name)

  if (name === 'mcp') {
    const toolField = (typeof input.tool === 'string' && input.tool)
      || (typeof input._tool === 'string' && input._tool)
      || ''
    if (toolField.startsWith('mcp__')) return splitDynamicName(toolField)
    const server = (typeof input.server === 'string' && input.server)
      || (typeof input._server === 'string' && input._server)
      || ''
    return toolField || server ? { server, tool: toolField } : null
  }

  return null
}

export function McpToolView({ tool, result }: ToolViewProps) {
  const parsed = parseMcpToolName(tool.name, tool.input)
  const args = Object.entries(tool.input).filter(
    ([key]) => !['tool', '_tool', 'server', '_server'].includes(key),
  )
  const title = parsed?.server ? `MCP - ${parsed.server}` : 'MCP'
  const toolName = parsed?.tool || tool.name

  return (
    <>
      <HeaderCard
        header={
          <>
            <span>{title}</span>
            <span className={HCARD_HEADER_PATH_CSS} title={toolName}>{toolName}</span>
          </>
        }
      >
        {args.length > 0 ? (
          <div className="flex flex-col border-t border-app-border-subtle">
            {args.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(90px,max-content)_minmax(0,1fr)] gap-2.5 border-b border-app-border-subtle px-2.5 py-[7px] text-[11px] leading-[1.45]">
                  <span className="shrink-0 font-mono text-app-text-muted">{key}</span>
                  <span className="[overflow-wrap:anywhere] font-mono text-app-text">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="px-2.5 py-2 text-[11px] text-app-text-muted">No arguments.</div>
        )}
      </HeaderCard>

      {result?.content && !result.isError && (
        <Section label="Result">
          <CodeBox content={result.content} copyable />
        </Section>
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <ErrorPre content={result.content} />
        </Section>
      )}
    </>
  )
}
