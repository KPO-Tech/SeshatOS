import { api } from '@renderer/api/client'
import type { ToolPromptRequest, ToolStatus } from '@renderer/api/types'
import type { RuntimeEventPayload } from '@renderer/components/chat/streaming/runtimeTypes'
import { handleSubagentStreamChunk } from '@renderer/components/chat/streaming/streamReducers'
import {
  ensureStreamingTool,
  fetchPlanContent,
  findLatestStreamingToolUseByName,
  findStreamingToolById,
  markLatestStreamingTool,
  normaliseMode,
  seedPlanFromRuntimeEvent,
  toolInputFromProgress,
  toolResultFromProgress,
  updateStreamingTool,
} from '@renderer/components/chat/streaming/streamToolState'
import { findLatestToolUseByName } from '@renderer/lib/chat'
import { permissionSignature } from '@renderer/lib/permissionSignature'
import { useSessionStore, type ToolActivity } from '@renderer/stores/session'
import { streamingToContentBlocks } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'

type SessionStore = ReturnType<typeof useSessionStore.getState>

export function handleRuntimeEvent(
  sessionId: string,
  event: RuntimeEventPayload,
  store: ReturnType<typeof useSessionStore.getState>,
  setPendingTool: (tool: ToolActivity | null) => void,
  getPendingTool: () => ToolActivity | null,
  syncAssistantMessage: () => void,
  onCompaction: (preTokens: number, postTokens: number) => void,
) {
  // Sub-agent events are tagged with agent_tool_use_id — route them separately.
  if (event.agent_tool_use_id) {
    handleSubagentEvent(sessionId, event, store)
    return
  }

  switch (event.type) {
    // Authoritative plan/execute mode signal, emitted the instant
    // enter_plan_mode/exit_plan_mode complete — previously the UI only ever
    // inferred the mode indirectly from a tool_name heuristic on the next
    // tool.progress(completed) event (see the 'tool.progress' case below),
    // which happened to work for the same reason but was guessing rather
    // than reading the engine's own signal for this.
    case 'execution_mode.changed': {
      store.updateAgentState(sessionId, { executionMode: normaliseMode(event.execution_mode) })
      break
    }

    // Named pre-generation setup phase - shown only while nothing more
    // concrete (thinking/a tool) is already happening, see
    // agentActivityPhrase's priority chain in Conversation.tsx. No "stage
    // ended" case exists: turn.started below always clears it.
    case 'turn.stage': {
      if (event.stage_event) store.updateAgentState(sessionId, { stage: event.stage_event })
      break
    }

    // Compaction otherwise happens completely silently - runs synchronously
    // inside this same turn (unlike an out-of-band /condense call), so its
    // event just arrives in-band with everything else already handled here,
    // no separate await/timeout wrapper needed.
    case 'context.compacted': {
      if (event.compaction_event) {
        onCompaction(event.compaction_event.pre_compact_tokens, event.compaction_event.post_compact_tokens)
      }
      break
    }

    case 'turn.started': {
      store.updateAgentState(sessionId, {
        executionMode: normaliseMode(event.execution_mode),
        turnNumber: event.turn_number ?? 0,
        isThinking: true,
        activeTool: null,
        stage: null,
      })
      break
    }

    case 'turn.completed': {
      store.updateAgentState(sessionId, {
        executionMode: normaliseMode(event.execution_mode),
        turnNumber: event.turn_number ?? 0,
        inputTokens: event.usage?.input_tokens ?? 0,
        outputTokens: event.usage?.output_tokens ?? 0,
        isThinking: false,
        activeTool: null,
        stage: null,
      })
      syncAssistantMessage()
      break
    }

    case 'turn.failed':
      store.updateAgentState(sessionId, { isThinking: false, activeTool: null, stage: null })
      markLatestStreamingTool(sessionId, store, null, 'failed')
      syncAssistantMessage()
      break

    case 'tool.permission_required': {
      const request = event.permission_request
      if (!request) break

      const approval = {
        toolUseId: request.tool_use_id,
        toolName: request.tool_name,
        toolInput: request.tool_input ?? {},
        description: request.description,
      }

      // "Always allow" from a previous PermissionCard — auto-resolve via the
      // same API the card's own buttons use, without ever surfacing it again.
      const signature = permissionSignature(request.tool_name, request.tool_input ?? {})
      if (useUIStore.getState().rememberedApprovals[signature]) {
        void api.post(`/permissions/${request.tool_use_id}`, { approved: true, remember: true, session_id: sessionId }).catch(() => {})
        updateStreamingTool(sessionId, store, request.tool_use_id, {
          _status: 'running',
          input: request.tool_input ?? {},
        })
        syncAssistantMessage()
        break
      }

      store.updateAgentState(sessionId, { pendingPermission: approval })
      ensureStreamingTool(sessionId, store, {
        toolUseId: request.tool_use_id,
        toolName: request.tool_name,
        input: request.tool_input ?? {},
        status: 'awaiting_approval',
        approval,
        message: request.description ?? `Awaiting approval for ${request.tool_name}`,
      })
      updateStreamingTool(sessionId, store, request.tool_use_id, {
        _status: 'awaiting_approval',
        _approval: approval,
        input: request.tool_input ?? {},
        _message: request.description ?? `Awaiting approval for ${request.tool_name}`,
      })
      syncAssistantMessage()
      break
    }

    case 'prompt.request': {
      const request = event.prompt_request
      if (!request) break

      const metadata = request.metadata ?? {}
      const metadataToolUseId =
        typeof metadata.tool_use_id === 'string' ? metadata.tool_use_id : ''
      const promptId =
        typeof metadata.prompt_id === 'string' ? metadata.prompt_id : ''
      const toolUseId =
        metadataToolUseId ||
        findLatestStreamingToolUseByName(sessionId, store, 'ask_user_question')?.id ||
        `ask-user-${Date.now()}`
      const toolName =
        typeof metadata.tool_name === 'string' ? metadata.tool_name : 'ask_user_question'

      const prompt: ToolPromptRequest = {
        promptId,
        type: request.type,
        message: request.message,
        options: request.options?.map((option) => ({ ...option })),
        default: request.default,
        metadata: { ...metadata },
      }

      ensureStreamingTool(sessionId, store, {
        toolUseId,
        toolName,
        status: 'running',
        message: request.message,
        prompt,
      })
      updateStreamingTool(sessionId, store, toolUseId, {
        _status: 'running',
        _prompt: prompt,
        _message: request.message,
      })
      syncAssistantMessage()
      break
    }

    case 'tool.progress': {
      const progress = event.tool_progress
      if (!progress) break

      const now = Date.now()
      const currentTool = progress.tool_use_id
        ? findStreamingToolById(sessionId, store, progress.tool_use_id)
        : findLatestToolUseByName([{ role: 'assistant', content: streamingToContentBlocks(store.getStreaming(sessionId)) }], progress.tool_name)
      const toolStatus = progress.stage as ToolStatus
      const progressInput = toolInputFromProgress(progress)

      if (!currentTool) {
        ensureStreamingTool(sessionId, store, {
          toolUseId: progress.tool_use_id || `${progress.tool_name}-${now}`,
          toolName: progress.tool_name,
          input: progressInput,
          status: toolStatus,
          message: progress.message,
        })
      }

      if (progress.stage === 'pending' || progress.stage === 'running') {
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: now,
        }
        store.updateAgentState(sessionId, { activeTool: activity })
        setPendingTool(activity)
      } else {
        const previous = getPendingTool()
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: previous?.startedAt ?? now,
          endedAt: now,
        }
        // Immediately reflect mode transitions in the Computer panel when the
        // mode tool completes, without waiting for the next turn.started event.
        const modeUpdate: Partial<import('@renderer/stores/session').AgentState> = {
          activeTool: null,
          pendingPermission: null,
        }
        if (progress.stage === 'completed') {
          if (progress.tool_name === 'enter_plan_mode') modeUpdate.executionMode = 'plan'
          else if (progress.tool_name === 'exit_plan_mode') modeUpdate.executionMode = 'execute'
          else if (progress.tool_name === 'enter_pair_programming_mode') modeUpdate.executionMode = 'pair_programming'
          else if (progress.tool_name === 'exit_pair_programming_mode') modeUpdate.executionMode = 'execute'
        }
        store.updateAgentState(sessionId, modeUpdate)
        store.pushToolActivity(sessionId, activity)
        setPendingTool(null)

        // When the agent tool itself completes/fails, propagate status to sub-agent state.
        //
        // For the synchronous `agent` tool, the outer tool call blocks until the
        // sub-agent is done, so this event IS the real completion signal.
        //
        // For `spawn_agent`, the outer tool call returns almost immediately (it
        // only starts a background agent), so the engine's generic tool-execution
        // pipeline emits a `tool.progress` "completed" event for `spawn_agent`
        // well before the underlying agent has actually finished. The real
        // completion is a *second*, later `tool.progress` event with the same
        // tool_use_id, emitted explicitly once the background agent's own
        // ag.Wait() unblocks (see spawn_agent.go) — it carries
        // metadata.subagent_finished=true to distinguish it from the spurious
        // first one. Without checking that marker, the sub-agent card would flip
        // to "Completed" within milliseconds while the agent keeps running, and
        // the real completion would never arrive to unstick it.
        //
        // The `agent` tool's own `run_in_background: true` mode has the exact
        // same problem, for the exact same reason: it reuses the SAME tool name
        // as the synchronous path above, so its own dispatch-only "completed"
        // event looks identical to a real completion at this layer.
        // metadata.background=true marks that first, premature event; the real
        // completion arrives as a second tool.progress event carrying
        // metadata.subagent_finished=true (see notifyAgentTaskCompletion in the
        // SDK's agent_tool.go) — the same marker spawn_agent already uses, since
        // both are the same "dispatch now, notify later" shape.
        const isSpawnAgentFinished = progress.tool_name === 'spawn_agent' && progress.metadata?.subagent_finished === true
        const isUnfinishedBackgroundAgentDispatch = progress.tool_name === 'agent'
          && progress.metadata?.background === true
          && progress.metadata?.subagent_finished !== true
        if ((progress.tool_name === 'agent' || isSpawnAgentFinished) && progress.tool_use_id) {
          const isRealCompletionSignal = !isUnfinishedBackgroundAgentDispatch
          const agentResultText = isRealCompletionSignal && progress.stage === 'completed'
            ? (typeof progress.metadata?.content === 'string'
                ? progress.metadata.content
                : typeof progress.message === 'string' ? progress.message : undefined)
            : undefined
          store.upsertSubagent(sessionId, progress.tool_use_id, {
            status: isUnfinishedBackgroundAgentDispatch
              ? 'running'
              : progress.stage === 'completed' ? 'completed' : 'failed',
            ...(isRealCompletionSignal ? { endedAt: now } : {}),
            isThinking: false,
            activeTool: null,
            error: isRealCompletionSignal && progress.stage === 'failed' ? (progress.message ?? 'Agent failed') : undefined,
            result: agentResultText,
          })
        }
      }

      const resolvedTool = progress.tool_use_id
        ? findStreamingToolById(sessionId, store, progress.tool_use_id)
        : currentTool

      if (resolvedTool) {
        const renderedResult = toolResultFromProgress(progress)
        updateStreamingTool(sessionId, store, resolvedTool.id, {
          _status: toolStatus,
          input: Object.keys(progressInput).length > 0 ? progressInput : resolvedTool.input,
          _result: renderedResult ?? resolvedTool._result,
          _approval: toolStatus === 'completed' || toolStatus === 'failed' ? undefined : resolvedTool._approval,
          _prompt: toolStatus === 'completed' || toolStatus === 'failed' ? undefined : resolvedTool._prompt,
          _message: progress.message ?? resolvedTool._message,
        })
        syncAssistantMessage()
      }
      break
    }

    case 'plan.submitted': {
      const planEvent = event.plan_event
      if (!planEvent) break
      store.upsertPlan(sessionId, seedPlanFromRuntimeEvent(sessionId, planEvent))
      void fetchPlanContent(sessionId, planEvent.plan_id, store)
      break
    }
  }
}

export function handleSubagentEvent(
  sessionId: string,
  event: RuntimeEventPayload,
  store: SessionStore,
) {
  const toolUseId = event.agent_tool_use_id!

  if (!store.getSubagent(sessionId, toolUseId)) {
    const parentBlock = store.getStreaming(sessionId).find(
      (block) => block.type === 'tool_use' && block.id === toolUseId,
    )
    const inputType = parentBlock?.type === 'tool_use'
      ? String(parentBlock.input.type ?? parentBlock.input.agent_type ?? 'agent')
      : 'agent'
    const inputTask = parentBlock?.type === 'tool_use'
      ? String(parentBlock.input.task ?? parentBlock.input.prompt ?? '')
      : ''
    store.upsertSubagent(sessionId, toolUseId, {
      agentType: inputType,
      task: inputTask,
      status: 'running',
    })
  }

  switch (event.type) {
    case 'agent.spawn.end': {
      const agentId = event.agent_event?.agent_id
      if (agentId) {
        store.upsertSubagent(sessionId, toolUseId, { agentId })
      }
      break
    }

    case 'turn.started': {
      store.upsertSubagent(sessionId, toolUseId, {
        turnNumber: event.turn_number ?? 0,
        isThinking: true,
        activeTool: null,
      })
      break
    }

    case 'turn.completed': {
      store.upsertSubagent(sessionId, toolUseId, {
        turnNumber: event.turn_number ?? 0,
        inputTokens: event.usage?.input_tokens ?? 0,
        outputTokens: event.usage?.output_tokens ?? 0,
        isThinking: false,
        activeTool: null,
      })
      break
    }

    case 'turn.failed': {
      store.upsertSubagent(sessionId, toolUseId, {
        isThinking: false,
        activeTool: null,
        status: 'failed',
      })
      break
    }

    case 'response.chunk': {
      const chunk = event.chunk
      if (!chunk) break
      handleSubagentStreamChunk(sessionId, toolUseId, chunk, store)
      break
    }

    case 'tool.progress': {
      const progress = event.tool_progress
      if (!progress) break

      const now = Date.now()
      const subagent = store.getSubagent(sessionId, toolUseId)

      if (subagent?.agentType === 'agent' && progress.metadata?.agent_type) {
        store.upsertSubagent(sessionId, toolUseId, {
          agentType: String(progress.metadata.agent_type),
        })
      }
      if (subagent?.task === '' && progress.metadata?.task) {
        store.upsertSubagent(sessionId, toolUseId, {
          task: String(progress.metadata.task),
        })
      }

      if (progress.stage === 'pending' || progress.stage === 'running') {
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: now,
        }
        store.upsertSubagent(sessionId, toolUseId, { activeTool: activity })
      } else {
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: now,
          endedAt: now,
        }
        store.pushSubagentToolActivity(sessionId, toolUseId, activity)
        store.upsertSubagent(sessionId, toolUseId, { activeTool: null })
      }

      const subagentCurrent = store.getSubagent(sessionId, toolUseId)
      if (!subagentCurrent) break
      const toolBlockIndex = subagentCurrent.streaming.findIndex(
        (block) => block.type === 'tool_use' && (progress.tool_use_id ? block.id === progress.tool_use_id : block.name === progress.tool_name),
      )
      if (toolBlockIndex >= 0) {
        store.updateSubagentStreamBlock(sessionId, toolUseId, subagentCurrent.streaming[toolBlockIndex].index, {
          _status: progress.stage as ToolStatus,
          _message: progress.message,
        })
      }
      break
    }
  }
}
