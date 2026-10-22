import { useEffect, useRef } from 'react'
import type { PlanDocument } from '@renderer/api/types'
import type { AgentState, StreamingBlock } from '@renderer/stores/session'
import type { RightPanelKind, RightPanelPayload } from '@renderer/stores/ui'
import { isAgentTool, isFileTool } from '@renderer/components/chat/tools/toolDisplay'

const WEB_INFO_TOOLS = new Set(['web_search', 'web_fetch', 'read_url', 'read_document_url'])

type ToolPanelCategory = Extract<RightPanelKind, 'computer' | 'browser' | 'files'>

function categoryForTool(toolName: string | undefined): ToolPanelCategory | null {
  if (!toolName) return null
  if (toolName.startsWith('browser_')) return 'browser'
  // agent/spawn_agent has its own SubagentPanel (opened by clicking the
  // agent card) - it isn't Computer's content, so don't steal focus back to
  // Computer every time the outer agent dispatches or re-dispatches one.
  if (isAgentTool(toolName)) return null
  // Files opens only on an explicit click (ToolLineItem/SilentToolView's own
  // toggle/handleClick), unlike Computer/Terminal/Browser which show
  // genuinely live activity worth auto-following - a Read the user never
  // asked to see (routine context-gathering, often several per turn)
  // shouldn't keep stealing focus from whatever panel they're actually
  // looking at.
  if (isFileTool(toolName)) return null
  // A picture or a clip is drawn in the conversation itself (InlineMedia): there is nothing to follow in a panel.
  if (toolName === 'generate_image' || toolName === 'text_to_speech' || toolName === 'present_artifact') return null
  return 'computer'
}

const PANEL_TITLE: Record<ToolPanelCategory, string> = {
  computer: 'Session',
  browser: 'Browser',
  files: 'Files',
}

type UseConversationPanelsArgs = {
  sessionId?: string
  agentState: AgentState
  streaming: StreamingBlock[]
  computerOpen: boolean
  filesOpen: boolean
  isPlanPending: boolean
  pendingPlan?: PlanDocument
  openRightPanel: (panel: RightPanelPayload) => void
}

export function useConversationPanels({
  sessionId,
  agentState,
  streaming,
  computerOpen,
  filesOpen,
  isPlanPending,
  pendingPlan,
  openRightPanel,
}: UseConversationPanelsArgs) {
  const browserToolNavigationRef = useRef<string | null>(null)
  const prevCategoryRef = useRef<ToolPanelCategory | null>(null)
  const activeToolName = agentState.activeTool?.toolName
  const isWebInfoTool = activeToolName != null && WEB_INFO_TOOLS.has(activeToolName)
  const isFileToolActive = activeToolName != null && isFileTool(activeToolName)
  const activeCategory = categoryForTool(activeToolName)

  // Follows whatever the agent is actively doing, switching panels the
  // moment its tool category changes (bash -> browser -> a file read -> a
  // web search, ...) instead of only auto-opening once when nothing is open
  // yet - that older guard meant an earlier panel (Terminal from a bash
  // call, say) silently blocked every later auto-open for the rest of the
  // turn, so the user had to switch panels by hand every time the agent
  // moved on to a different kind of tool. Keyed on the *transition* (ref),
  // not the level, so it fires exactly once per switch and never fights a
  // panel the user deliberately closed while the agent keeps using the same
  // tool category.
  useEffect(() => {
    if (sessionId && activeCategory && activeCategory !== prevCategoryRef.current) {
      openRightPanel({ kind: activeCategory, title: PANEL_TITLE[activeCategory], sessionId })
    }
    prevCategoryRef.current = activeCategory
  }, [activeCategory, sessionId, openRightPanel])

  // While Computer is already showing, follow each web_search/web_fetch call
  // live as it starts running instead of leaving the panel on whatever it
  // last showed (or making the user click into it from the transcript) -
  // same live-updating idea as the browser_* effect below, just targeting
  // Computer's own focusToolId instead of navigating a URL.
  useEffect(() => {
    if (!sessionId || !computerOpen || !isWebInfoTool || !activeToolName) return
    const toolBlock = [...streaming].reverse().find((block) => block.type === 'tool_use' && block.name === activeToolName)
    if (toolBlock?.type !== 'tool_use') return
    openRightPanel({ kind: 'computer', title: 'Session', sessionId, focusToolId: toolBlock.id })
  }, [activeToolName, isWebInfoTool, computerOpen, openRightPanel, sessionId, streaming])

  // Follows each read/write/edit call live while Files is showing, the same
  // way Computer follows web tools above.
  useEffect(() => {
    if (!sessionId || !filesOpen || !isFileToolActive || !activeToolName) return
    const toolBlock = [...streaming].reverse().find((block) => block.type === 'tool_use' && block.name === activeToolName)
    if (toolBlock?.type !== 'tool_use') return
    openRightPanel({ kind: 'files', title: 'Files', sessionId, focusToolId: toolBlock.id })
  }, [activeToolName, isFileToolActive, filesOpen, openRightPanel, sessionId, streaming])

  useEffect(() => {
    const tool = agentState.activeTool
    if (!tool?.toolName.startsWith('browser_')) return
    if (tool.toolName !== 'browser_open' && tool.toolName !== 'browser_navigate') return
    const toolBlock = [...streaming].reverse().find((block) => (
      block.type === 'tool_use' &&
      block.name === tool.toolName
    ))
    const input = toolBlock?.type === 'tool_use'
      ? toolBlock.input as Record<string, unknown> | undefined
      : undefined
    const target = typeof input?.url === 'string'
      ? input.url
      : typeof input?.target === 'string'
        ? input.target
        : null
    const navKey = target ? `${tool.toolName}:${target}` : null
    if (target && browserToolNavigationRef.current !== navKey) {
      browserToolNavigationRef.current = navKey
      void window.seshat?.browser?.openUrl(target, 'builtin', sessionId).catch(() => undefined)
    }
  }, [agentState.activeTool, sessionId, streaming])

  // Auto-open the plan review panel when the agent calls exit_plan_mode
  // without a structured PlanDocument.
  useEffect(() => {
    if (!sessionId || !isPlanPending || pendingPlan) return
    openRightPanel({ kind: 'plan', title: 'Implementation Plan', sessionId })
  }, [isPlanPending, openRightPanel, pendingPlan, sessionId])

  // Same auto-open for the structured/document-backed path - keyed on the
  // plan's own id so a brand new plan (a fresh submit_plan call, or a
  // revision after feedback) re-surfaces the panel even if it was closed or
  // showing something else, matching the raw-plan behavior above.
  useEffect(() => {
    if (!sessionId || !pendingPlan) return
    openRightPanel({ kind: 'plan', title: 'Implementation Plan', sessionId, planId: pendingPlan.id })
  }, [openRightPanel, pendingPlan?.id, sessionId])
}
