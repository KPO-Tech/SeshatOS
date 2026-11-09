import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@renderer/stores/session'
import { handleRuntimeEvent } from './runtimeEvents'
import type { RuntimeEventPayload } from './runtimeTypes'

function send(event: Partial<RuntimeEventPayload>) {
  handleRuntimeEvent('s1', { agent_tool_use_id: 'agent-1', ...event } as RuntimeEventPayload, useSessionStore.getState(), () => undefined, () => null, () => undefined, () => undefined)
}

describe('a tool called by a sub-agent', () => {
  it('is kept with what it was given and what it returned, even when it never came as a content block', () => {
    send({ type: 'tool.progress', tool_progress: { tool_name: 'read', tool_use_id: 't1', stage: 'running', metadata: { tool_input: { file_path: 'a.ts' } } } } as never)
    send({ type: 'tool.progress', tool_progress: { tool_name: 'read', tool_use_id: 't1', stage: 'completed', metadata: { content: 'file body', tool_input: { file_path: 'a.ts' } } } } as never)

    const streaming = useSessionStore.getState().getSubagent('s1', 'agent-1')?.streaming ?? []
    const tools = streaming.filter((block) => block.type === 'tool_use')
    expect(tools).toHaveLength(1)
    const tool = tools[0]
    if (tool.type !== 'tool_use') throw new Error('not a tool')
    expect(tool.name).toBe('read')
    expect(tool.input).toEqual({ file_path: 'a.ts' })
    expect(tool._status).toBe('completed')
    expect(tool._result?.content).toBe('file body')
  })
})
