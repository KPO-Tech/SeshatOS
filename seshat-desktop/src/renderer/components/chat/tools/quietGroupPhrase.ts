import type { ToolStatus, ToolUseBlock } from '@renderer/api/types'
import { toolCategory, toolLabel, toolSoloLabel, type ToolCategory } from './toolDisplay'

export function toolStatus(tool: ToolUseBlock): ToolStatus {
  return tool._status ?? (tool._result ? (tool._result.isError ? 'failed' : 'completed') : 'running')
}

// A run only breaks on an awaiting-approval tool — that one needs its own
// PermissionCard, which can't live inside a collapsed group. A failed tool
// stays IN the run: it's still shown adjacent to its neighbors in one
// shared foldable block, same as a successful one — QuietGroupItem's own
// per-item line already surfaces the failure (a red ✗, expandable to the
// error text) without needing to break out into a separate top-level card.
export function breaksGroup(tool: ToolUseBlock): boolean {
  return toolStatus(tool) === 'awaiting_approval'
}

function clauseFor(category: ToolCategory, count: number): string {
  switch (category) {
    case 'read': return count === 1 ? 'Read a file' : `Read ${count} files`
    case 'search': return count === 1 ? 'Searched' : `Searched ${count} times`
    case 'edit': return count === 1 ? 'Edited a file' : `Edited ${count} files`
    case 'write': return count === 1 ? 'Wrote a file' : `Wrote ${count} files`
    case 'bash': return count === 1 ? 'Ran a command' : `Ran ${count} commands`
    case 'other': return count === 1 ? 'Ran a tool' : `Ran ${count} tools`
  }
}

const MAX_CLAUSES = 4

// Builds the collapsed group line's label from an ordered run of tool_use
// blocks. Single-item and multi-item runs go through the same function —
// a lone edit is just the length-1 case.
export function summarizeQuietGroup(tools: ToolUseBlock[]): string {
  if (tools.length === 0) return ''

  if (tools.length === 1) {
    const tool = tools[0]
    const specific = toolSoloLabel(tool)
    if (specific) return specific

    if (tool._message && tool._message.trim().length >= 12 && tool._message.includes(' ')) {
      return tool._message
    }
    const category = toolCategory(tool.name)
    // "other" bucket covers every tool without a dedicated verb (rag_search,
    // apply_patch, MCP tools, ...) — its own label is more useful standalone
    // than a generic "Ran a tool".
    if (category === 'other') return toolLabel(tool.name)
    return clauseFor(category, 1)
  }

  const order: ToolCategory[] = []
  const counts = new Map<ToolCategory, number>()
  for (const tool of tools) {
    const category = toolCategory(tool.name)
    if (!counts.has(category)) order.push(category)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const clauses = order.slice(0, MAX_CLAUSES).map((c) => clauseFor(c, counts.get(c) ?? 0))
  const label = clauses.join(', ')
  return order.length > MAX_CLAUSES ? `${label}, …` : label
}

// A short, always-visible second line under a timeline row - "failed" for an
// error, otherwise a line-count of the result so there's something to read
// without having to click into every row. null while still running/pending
// (nothing landed yet) or when the result has no readable content.
export function toolResultSubtitle(tool: ToolUseBlock): string | null {
  const status = toolStatus(tool)
  if (status === 'failed') return 'failed'
  if (status !== 'completed') return null
  const content = tool._result?.content
  if (!content) return null
  const lines = content.split('\n').filter((l) => l.trim() !== '').length
  if (lines === 0) return null
  return `${lines} line${lines === 1 ? '' : 's'}`
}
