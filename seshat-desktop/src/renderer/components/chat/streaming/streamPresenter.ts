import type { StreamingBlock } from '@renderer/stores/session'
import { isScrolling } from '@renderer/lib/scrollActivity'

// A delta this short is shown at once; a longer one is let out over the next frames, so text arrives as a flow rather than in bursts.
const LARGE_DELTA_THRESHOLD = 5
// The least a queued block shows per frame. With the share of the backlog below, a short queue still moves a few characters at a time and
// one that fell behind the live stream catches up in a handful of frames instead of growing until the next flush dumps it in one jump.
const MIN_CHARS_PER_FRAME = 6
const BACKLOG_SHARE_PER_FRAME = 0.35
// A hidden window has no animation frames: the queue drains on a timer instead, so the turn still ends on time.
const HIDDEN_FRAME_MS = 16

type FrameHandle = { kind: 'raf'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> }

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

function requestFrame(callback: () => void): FrameHandle {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (hidden || typeof requestAnimationFrame !== 'function') return { kind: 'timeout', id: setTimeout(callback, HIDDEN_FRAME_MS) }
  return { kind: 'raf', id: requestAnimationFrame(callback) }
}

function cancelFrameHandle(handle: FrameHandle) {
  if (handle.kind === 'raf') cancelAnimationFrame(handle.id)
  else clearTimeout(handle.id)
}

/**
 * Turns the blocks of a streaming answer into what is shown, at most once per frame. Every publish redraws the answer being written, so
 * the stream, however fast its deltas come, costs one store update per frame the screen can show, and the frames left are the reader's.
 *
 * Blocks are kept as given (the reducers never change a block in place): a tool call that did not change keeps the same object, so a part
 * of the screen that only shows tools is not drawn again for each token of the text.
 */
export class StreamPresenter {
  private target: StreamingBlock[] = []
  private displayed: StreamingBlock[] = []
  private frame: FrameHandle | null = null
  private idleResolvers: Array<() => void> = []
  private queues = new Map<number, string>()

  constructor(private readonly publish: (blocks: StreamingBlock[]) => void) {}

  update(target: StreamingBlock[]) {
    const previous = this.target
    this.target = target
    const displayed = this.displayed.slice(0, target.length)

    target.forEach((block, index) => {
      if (block.type !== 'text' && block.type !== 'thinking') {
        displayed[index] = block
        return
      }

      const type = block.type
      const delta = textOf(block, type).slice(textOf(previous[index], type).length)
      if (!delta) {
        if (!displayed[index]) displayed[index] = withText(block, type, '')
        return
      }

      const queued = this.queues.get(index)
      if (queued) {
        this.queues.set(index, queued + delta)
        return
      }

      if (delta.length < LARGE_DELTA_THRESHOLD) {
        const current = displayed[index] ?? withText(block, type, '')
        displayed[index] = withText(current, type, textOf(current, type) + delta)
        return
      }

      this.queues.set(index, delta)
    })

    this.displayed = displayed
    this.schedule()
  }

  flush(target = this.target) {
    this.target = target
    this.cancelFrame()
    this.queues.clear()
    this.displayed = [...target]
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
    this.queues.clear()
    this.resolveIdle()
  }

  private schedule() {
    if (this.frame !== null) return
    this.frame = requestFrame(this.onFrame)
  }

  private onFrame = () => {
    this.frame = null
    // The person is scrolling: nothing is drawn until they stop, so the frames are all theirs. The text keeps arriving in target and
    // shows at once afterwards (see scrollActivity.ts).
    if (isScrolling()) {
      this.schedule()
      return
    }
    this.advanceQueues()
    this.publish(this.displayed)
    if (this.queues.size > 0) this.schedule()
    else this.resolveIdle()
  }

  private advanceQueues() {
    if (this.queues.size === 0) return
    const displayed = [...this.displayed]
    for (const [index, queued] of this.queues) {
      const targetBlock = this.target[index]
      if (!targetBlock || (targetBlock.type !== 'text' && targetBlock.type !== 'thinking')) {
        this.queues.delete(index)
        continue
      }
      const take = Math.min(queued.length, Math.max(MIN_CHARS_PER_FRAME, Math.ceil(queued.length * BACKLOG_SHARE_PER_FRAME)))
      const type = targetBlock.type
      const rest = queued.slice(take)
      if (rest) this.queues.set(index, rest)
      else this.queues.delete(index)
      const current = displayed[index] ?? withText(targetBlock, type, '')
      displayed[index] = withText(current, type, textOf(current, type) + queued.slice(0, take))
    }
    this.displayed = displayed
  }

  private cancelFrame() {
    if (this.frame === null) return
    cancelFrameHandle(this.frame)
    this.frame = null
  }

  private resolveIdle() {
    this.idleResolvers.splice(0).forEach((resolve) => resolve())
  }
}
