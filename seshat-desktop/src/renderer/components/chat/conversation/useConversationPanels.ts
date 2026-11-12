import { useEffect, useRef } from 'react'
import type { PlanDocument } from '@renderer/api/types'
import type { AgentState } from '@renderer/stores/session'
import type { RightPanelKind, RightPanelPayload } from '@renderer/stores/ui'
import { isFileTool } from '@renderer/components/chat/tools/toolDisplay'
import { htmlArtifactPanel, presentedPages } from '@renderer/lib/htmlArtifact'
import { useTranslation } from 'react-i18next'
import { useStreamingTools } from '@renderer/components/chat/state/useStreamingTools'

type ToolPanelCategory = Extract<RightPanelKind, 'browser'>

/**
 * Which right panel, if any, follows the tool the agent is running.
 *
 * Only the browser gets one: a page loads and navigates on its own, and the
 * panel shows it live, which a chat row cannot. Every other tool draws its
 * result in the conversation under its own line - bash, MCP, knowledge, RAG,
 * notebook, and anything the engine adds later - so opening the Session panel
 * for them stole the panel from whatever the user was actually reading.
 * Subagents keep their own SubagentPanel, opened from the agent card.
 *
 * This is an allow-list on purpose: a tool that genuinely needs a live panel
 * has to be named here, instead of every tool nobody thought about getting
 * one by default.
 */
function categoryForTool(toolName: string | undefined): ToolPanelCategory | null {
  if (!toolName) return null
  if (toolName.startsWith('browser_')) return 'browser'
  return null
}

const PANEL_TITLE: Record<ToolPanelCategory, string> = {
  browser: 'Browser',
}

type UseConversationPanelsArgs = {
  sessionId?: string
  agentState: AgentState
  filesOpen: boolean
  isPlanPending: boolean
  pendingPlan?: PlanDocument
  openRightPanel: (panel: RightPanelPayload) => void
}

export function useConversationPanels({
  sessionId,
  agentState,
  filesOpen,
  isPlanPending,
  pendingPlan,
  openRightPanel,
}: UseConversationPanelsArgs) {
  const { t } = useTranslation('chat')
  // Only the tool calls: the effects below follow tools, and reading every block drew the whole page again for each token.
  const streaming = useStreamingTools(sessionId)
  const browserToolNavigationRef = useRef<string | null>(null)
  const prevCategoryRef = useRef<ToolPanelCategory | null>(null)
  const openedPagesRef = useRef(new Set<string>())
  // The plan the agent builds is the one thing the chat cannot show while it is written:
  // the first task opens the Session panel, once per session.
  const planOpenedRef = useRef<string | null>(null)
  const activeToolName = agentState.activeTool?.toolName
  const isFileToolActive = activeToolName != null && isFileTool(activeToolName)
  const activeCategory = categoryForTool(activeToolName)

  // Opens the Browser panel the moment the agent starts browsing, and only
  // for that: every other tool now draws its result in the chat (see
  // categoryForTool), so there is no other category to switch to. Keyed on
  // the *transition* (ref) rather than the level, so it fires once per
  // switch and never fights a panel the user deliberately closed while the
  // agent keeps using the browser.
  useEffect(() => {
    if (sessionId && activeCategory && activeCategory !== prevCategoryRef.current) {
      openRightPanel({ kind: activeCategory, title: PANEL_TITLE[activeCategory], sessionId })
    }
    prevCategoryRef.current = activeCategory
  }, [activeCategory, sessionId, openRightPanel])

  useEffect(() => {
    if (!sessionId || planOpenedRef.current === sessionId) return
    const creating = streaming.some((block) => block.type === 'tool_use' && block.name === 'task_create')
    if (!creating) return
    planOpenedRef.current = sessionId
    openRightPanel({ kind: 'computer', title: t('chat.panels.computerPanel.session'), sessionId })
  }, [openRightPanel, sessionId, streaming, t])

  // Follows each read/write/edit call live while Files is showing.
  useEffect(() => {
    if (!sessionId || !filesOpen || !isFileToolActive || !activeToolName) return
    const toolBlock = [...streaming].reverse().find((block) => block.type === 'tool_use' && block.name === activeToolName)
    if (toolBlock?.type !== 'tool_use') return
    openRightPanel({ kind: 'files', title: t('chat.conversation.useConversationPanels.files'), sessionId, focusToolId: toolBlock.id })
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

  // A web page the agent presents (present_artifact) opens live in the Artifact panel the moment the call finishes, once per call: only
  // calls of the turn being streamed, so reopening a conversation does not reopen the pages it showed.
  useEffect(() => {
    if (!sessionId) return
    const fresh = presentedPages(streaming).filter((item) => !openedPagesRef.current.has(item.toolId))
    const page = fresh.at(-1)
    if (!page) return
    for (const item of fresh) openedPagesRef.current.add(item.toolId)
    openRightPanel(htmlArtifactPanel(sessionId, page.path, page.title))
  }, [openRightPanel, sessionId, streaming])

  // Auto-open the plan review panel when the agent calls exit_plan_mode
  // without a structured PlanDocument.
  useEffect(() => {
    if (!sessionId || !isPlanPending || pendingPlan) return
    openRightPanel({ kind: 'plan', title: t('chat.conversation.useConversationPanels.implementationPlan'), sessionId })
  }, [isPlanPending, openRightPanel, pendingPlan, sessionId])

  // Same auto-open for the structured/document-backed path - keyed on the
  // plan's own id so a brand new plan (a fresh submit_plan call, or a
  // revision after feedback) re-surfaces the panel even if it was closed or
  // showing something else, matching the raw-plan behavior above.
  useEffect(() => {
    if (!sessionId || !pendingPlan) return
    openRightPanel({ kind: 'plan', title: t('chat.conversation.useConversationPanels.implementationPlan'), sessionId, planId: pendingPlan.id })
  }, [openRightPanel, pendingPlan?.id, sessionId])
}
