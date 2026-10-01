import type { StreamingBlock } from '@renderer/stores/session'

type TimerHandle = ReturnType<typeof setTimeout>

const LARGE_DELTA_THRESHOLD = 5
const MICRO_CHUNK_DELAY_MS = 5

function textOf(block: StreamingBlock | undefined, type: 'text' | 'thinking') {
  if (!block) return ''
  if (type === 'text' && block.type === 'text') return block.text
  if (type === 'thinking' && block.type === 'thinking') return block.thinking
  return ''
}

function withText(block: StreamingBlock, type: 'text' | 'thinking', text: string): StreamingBlock {
  return type === 'text'
    ? { ...block, type: 'text', text }
    : { ...block, type: 'thinking', thinking: text }
}

function cloneBlocks(blocks: StreamingBlock[]) {
  return blocks.map((block) => {
    if (block.type === 'text' || block.type === 'thinking') return { ...block }
    return {
      ...block,
      input: { ...block.input },
      metadata: block.metadata ? { ...block.metadata } : undefined,
      _approval: block._approval ? { ...block._approval, toolInput: { ...block._approval.toolInput } } : undefined,
      _prompt: block._prompt
        ? {
            ...block._prompt,
            options: block._prompt.options?.map((option) => ({ ...option })),
            metadata: block._prompt.metadata ? { ...block._prompt.metadata } : undefined,
          }
        : undefined,
      _result: block._result
        ? {
            ...block._result,
            metadata: block._result.metadata ? { ...block._result.metadata } : undefined,
          }
        : undefined,
    }
  }) as StreamingBlock[]
}

function pendingCharacterCount(current: StreamingBlock[], target: StreamingBlock[]) {
  return target.reduce((total, block, index) => {
    const shown = current[index]
    if (block.type === 'text') {
      return total + Math.max(0, block.text.length - (shown?.type === 'text' ? shown.text.length : 0))
    }
    if (block.type === 'thinking') {
      return total + Math.max(0, block.thinking.length - (shown?.type === 'thinking' ? shown.thinking.length : 0))
    }
    return total
  }, 0)
}

export class StreamPresenter {
  private target: StreamingBlock[] = []
  private displayed: StreamingBlock[] = []
  private frame: TimerHandle | null = null
  private idleResolvers: Array<() => void> = []
  private queues = new Map<number, string>()
  private trickleTimer: TimerHandle | null = null

  constructor(private readonly publish: (blocks: StreamingBlock[]) => void) {}

  update(target: StreamingBlock[]) {
    const previous = this.target
    this.target = cloneBlocks(target)

    this.target.forEach((block, index) => {
      if (block.type !== 'text' && block.type !== 'thinking') {
        this.displayed[index] = cloneBlocks([block])[0]
        return
      }

      const type = block.type
      const delta = textOf(block, type).slice(textOf(previous[index], type).length)
      if (!delta) return

      const queued = this.queues.get(index)
      if (queued) {
        this.queues.set(index, queued + delta)
        return
      }

      if (delta.length < LARGE_DELTA_THRESHOLD) {
        const current = this.displayed[index] ?? withText(block, type, '')
        this.displayed[index] = withText(current, type, textOf(current, type) + delta)
        return
      }

      this.queues.set(index, delta)
    })

    this.displayed = this.displayed.slice(0, this.target.length)
    this.startTrickle()
    this.schedule()
  }

  flush(target = this.target) {
    this.target = cloneBlocks(target)
    this.cancelFrame()
    this.cancelTrickle()
    this.queues.clear()
    this.displayed = cloneBlocks(this.target)
    this.publish(this.displayed)
    this.resolveIdle()
  }

  drain() {
    if (pendingCharacterCount(this.displayed, this.target) === 0) {
      this.flush(this.target)
      return Promise.resolve()
    }
    this.schedule()
    return new Promise<void>((resolve) => this.idleResolvers.push(resolve))
  }

  cancel() {
    this.cancelFrame()
    this.cancelTrickle()
    this.queues.clear()
    this.resolveIdle()
  }

  private schedule() {
    if (this.frame !== null) return
    this.frame = setTimeout(() => {
      this.frame = null
      this.publish(this.displayed)
      if (this.queues.size === 0) this.resolveIdle()
    }, 16)
  }

  private startTrickle() {
    if (this.trickleTimer !== null || this.queues.size === 0) return
    this.tickTrickle()
  }

  private tickTrickle = () => {
    this.trickleTimer = null
    for (const [index, queued] of this.queues) {
      // Proportional to the backlog, not flat - a short queue still trickles
      // a couple characters at a time (feels smooth), but a queue that fell
      // behind the live stream (delta arrival faster than a flat drain rate
      // could ever keep up with) catches up in a handful of ticks instead of
      // growing without bound until the next flush() dumps the whole backlog
      // in one visible jump.
      const take = Math.min(queued.length, Math.max(2, Math.ceil(queued.length * 0.2)) + Math.floor(Math.random() * 2))
      const targetBlock = this.target[index]
      if (!targetBlock || (targetBlock.type !== 'text' && targetBlock.type !== 'thinking')) {
        this.queues.delete(index)
        continue
      }
      const type = targetBlock.type
      const shown = queued.slice(0, take)
      const rest = queued.slice(take)
      if (rest) this.queues.set(index, rest)
      else this.queues.delete(index)

      const current = this.displayed[index] ?? withText(targetBlock, type, '')
      this.displayed[index] = withText(current, type, textOf(current, type) + shown)
    }
    this.publish(this.displayed)
    if (this.queues.size === 0) {
      this.resolveIdle()
      return
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    this.trickleTimer = setTimeout(this.tickTrickle, hidden ? 0 : MICRO_CHUNK_DELAY_MS)
  }

  private cancelFrame() {
    if (this.frame === null) return
    clearTimeout(this.frame)
    this.frame = null
  }

  private cancelTrickle() {
    if (this.trickleTimer === null) return
    clearTimeout(this.trickleTimer)
    this.trickleTimer = null
  }

  private resolveIdle() {
    this.idleResolvers.splice(0).forEach((resolve) => resolve())
  }
}
