import { memo } from 'react'
import type { ToolStatus } from '@renderer/api/types'
import { isSilentTool, toolSnippet } from './toolDisplay'
import { SilentToolView } from './renderers/SilentToolView'
import { ToolLineItem } from './ToolLineItem'
import type { ToolBlockProps } from './types'

// Note: awaiting_approval tool_use blocks never reach ToolBlock — MessageItem
// renders PermissionCard standalone for that status instead (see
// MessageItem.tsx's tool_use branch). A lone tool of any other status
// (including failed) reaches here whenever it has no adjacent tool_use
// sibling — see MessageItem.groupBlocks(), which otherwise routes runs of
// 2+ into QuietToolGroup instead.
//
// A solo tool gets the exact same terse, foldable line as one running
// inside a group (ToolLineItem) - it's the group wrapper that differs, not
// the individual row. A bordered "card" treatment here made even a single
// Read/Write look as heavy as an actual multi-step operation.
export const ToolBlock = memo(function ToolBlock({ tool, sessionId, autoExpand = false, onSubmitPrompt }: ToolBlockProps) {
  const result = tool._result
  const status: ToolStatus = tool._status
    ?? (result ? (result.isError ? 'failed' : 'completed') : 'running')

  if (isSilentTool(tool.name)) {
    return (
      <SilentToolView
        tool={tool}
        result={result}
        status={status}
        snippet={toolSnippet(tool)}
        sessionId={sessionId}
      />
    )
  }

  return <ToolLineItem tool={tool} sessionId={sessionId} autoExpand={autoExpand} onSubmitPrompt={onSubmitPrompt} />
})
