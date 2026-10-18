import { describe, expect, it, vi } from 'vitest'
import { handleRuntimeEvent } from './runtimeEvents'
import type { RuntimeEventPayload } from './runtimeTypes'

function run(event: RuntimeEventPayload) {
  const updateAgentState = vi.fn()
  const onCompaction = vi.fn()
  handleRuntimeEvent(
    's1',
    event,
    { updateAgentState } as never,
    () => undefined,
    () => null,
    () => undefined,
    onCompaction,
  )
  return { updateAgentState, onCompaction }
}

describe('context.usage', () => {
  it('stores the figure the runtime reported', () => {
    const { updateAgentState } = run({
      type: 'context.usage',
      context_usage_event: { used_tokens: 52_000, window_tokens: 128_000, auto_compact_at_tokens: 107_100, source: 'reported' },
    } as RuntimeEventPayload)
    expect(updateAgentState).toHaveBeenCalledWith('s1', { liveContext: { used: 52_000, window: 128_000, autoCompactAt: 107_100 } })
  })

  it('ignores a report without a window', () => {
    const { updateAgentState } = run({
      type: 'context.usage',
      context_usage_event: { used_tokens: 52_000, window_tokens: 0, auto_compact_at_tokens: 0 },
    } as RuntimeEventPayload)
    expect(updateAgentState).not.toHaveBeenCalled()
  })

  it('ignores an event with no payload', () => {
    const { updateAgentState } = run({ type: 'context.usage' } as RuntimeEventPayload)
    expect(updateAgentState).not.toHaveBeenCalled()
  })
})

describe('context.compacted', () => {
  it('forgets the old figure, which described the conversation before it was compacted', () => {
    const { updateAgentState, onCompaction } = run({
      type: 'context.compacted',
      compaction_event: { pre_compact_tokens: 107_000, post_compact_tokens: 60_000 },
    } as RuntimeEventPayload)
    expect(onCompaction).toHaveBeenCalledWith(107_000, 60_000)
    expect(updateAgentState).toHaveBeenCalledWith('s1', { liveContext: null })
  })
})
