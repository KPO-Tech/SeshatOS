import type { ToolStatus, ToolUseBlock } from '@renderer/api/types'
import { toolCategory, toolLabel, toolSoloLabel, type ToolCategory } from './toolDisplay'

export function toolStatus(tool: ToolUseBlock): ToolStatus {
  return tool._status ?? (tool._result ? (tool._result.isError ? 'failed' : 'completed') : 'running')
}

// A run only breaks on an awaiting-approval tool — that one needs its own
// PermissionCard, which can't live inside a quiet group's timeline. A failed
// tool stays IN the run: it's still shown adjacent to its neighbors in the
// same timeline, same as a successful one — each row's own line already
// surfaces the failure (a red ✗, expandable to the error text) without
// needing to break out into a separate top-level card.
export function breaksGroup(tool: ToolUseBlock): boolean {
  return toolStatus(tool) === 'awaiting_approval'
}

function clauseFor(category: ToolCategory): string {
  switch (category) {
    case 'read': return 'Read a file'
    case 'search': return 'Searched'
    case 'edit': return 'Edited a file'
    case 'write': return 'Wrote a file'
    case 'bash': return 'Ran a command'
    case 'other': return 'Ran a tool'
  }
}

// The one-line label for a single tool's row in a quiet group's timeline
// (QuietToolGroup deliberately shows every step - there is no collapsed
// "Read 3 files, Searched twice" summary line; that form was removed, and
// this used to carry a multi-tool branch for it that nothing called).
export function summarizeTool(tool: ToolUseBlock): string {
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
  return clauseFor(category)
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
