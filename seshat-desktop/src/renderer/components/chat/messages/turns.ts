import type { ContentBlock, Message, ToolUseBlock } from '@renderer/api/types'
import { isCompactionDivider } from '@renderer/lib/compactedHistory'
import { isAgentTool, isDecisionTool } from '../tools/toolDisplay'

// Tools the chat never draws a line for: each has its own surface elsewhere.
// - mode-switching tools: silent, handled by the Computer panel
// - task_create/task_update/task_list: the live task list with per-item status
//   already lives in the Computer panel (auto-opened on task_create - see
//   useConversationPanels.ts), which is a far more useful view than a growing
//   wall of "Create Task"/"Update Task" lines for every single item
const HIDDEN_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'enter_pair_programming_mode',
  'exit_pair_programming_mode',
  'task_create',
  'task_update',
  'task_list',
])

// A message that holds only tool_result blocks is the separator the runtime
// writes after a tool call, not something a person wrote: it is never shown,
// and it does not end the turn it sits in.
export function isToolResultOnly(message: Message): boolean {
  return message.role === 'user' && message.content.length > 0 && message.content.every((block) => block.type === 'tool_result')
}

/** The blocks of a message the chat draws: what a person reads, and what the agent did. */
export function shownBlocks(message: Message): ContentBlock[] {
  return message.content.filter((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !HIDDEN_TOOLS.has(block.name)
    return false
  })
}

/**
 * A tool call the reader has to see in place: a card waiting for an answer, or a
 * plan handed over for review. Folding it would hide what the turn is asking
 * about, so the steps before it fold above it and the ones after fold below.
 */
function isDecision(block: ContentBlock): boolean {
  if (block.type !== 'tool_use') return false
  if (block._status === 'awaiting_approval') return true
  // A plan handed over for review, a step that produced something to look at
  // (an image, an audio file, a document - see decidesInPlace in toolDisplay),
  // or a sub-agent: these are what the turn is about, not work behind it.
  return block.name === 'submit_plan' || isDecisionTool(block.name) || isAgentTool(block.name)
}

export type TurnLayout = {
  /** Folded behind a header: this row draws nothing of its own. */
  folded: boolean
  /** The steps behind the header drawn by this message, oldest first. Empty for every message that draws none. */
  foldedMessages: Message[]
  /** Index of the message that opens the turn, used as the identity of the turn. */
  turnStart: number
}

/**
 * Splits the conversation into turns and works out which steps fold where.
 *
 * A turn runs from a message a person wrote (or the top of the conversation) to
 * the next one. Everything the agent did in it, except its last message, has
 * already been read by the time the answer arrives, so it goes behind the
 * "Worked for ..." header of the next message that stays visible.
 */
export function layoutTurns(messages: Message[]): TurnLayout[] {
  const layout: TurnLayout[] = messages.map((_, index) => ({ folded: false, foldedMessages: [], turnStart: index }))
  let start = 0
  for (let index = 0; index <= messages.length; index++) {
    const message = messages[index]
    const opensNext =
      index === messages.length ||
      (message !== undefined && !isToolResultOnly(message) && (message.role === 'user' || isCompactionDivider(message)))
    if (!opensNext) continue
    foldTurn(messages, start, index, layout)
    start = index
  }
  return layout
}

function foldTurn(messages: Message[], start: number, end: number, layout: TurnLayout[]): void {
  for (let index = start; index < end; index++) layout[index].turnStart = start

  const steps: number[] = []
  for (let index = start; index < end; index++) {
    if (messages[index].role === 'assistant') steps.push(index)
  }
  if (steps.length < 2) return

  // Steps pile up until one of them has to be read in place: the answer, or a
  // decision. The pile then folds above that message, so nothing ever moves
  // out of the order it ran in.
  let pile: number[] = []
  for (const index of steps) {
    const showsInPlace = index === steps[steps.length - 1] || messages[index].content.some(isDecision)
    if (!showsInPlace) {
      pile.push(index)
      continue
    }
    if (pile.length === 0) continue
    for (const foldedIndex of pile) layout[foldedIndex].folded = true
    layout[index].foldedMessages = pile.map((foldedIndex) => messages[foldedIndex])
    pile = []
  }
}

export type FoldedToolItem =
  | { kind: 'tool'; tool: ToolUseBlock }
  | { kind: 'thinking'; thinkingId: string; thinking: string }

/** One part of a fold, as the header draws it. */
export type FoldedStep =
  | { kind: 'message'; message: Message }
  | { kind: 'tools'; items: FoldedToolItem[] }

/**
 * The steps of a turn, ready to draw. A step that says something is drawn as
 * itself; the steps that are only tool calls and reasoning run together in one
 * timeline, however the runtime happened to split them into messages - which is
 * why a dozen reads show as one block instead of a dozen separate rows.
 */
export function foldSteps(messages: Message[]): FoldedStep[] {
  const steps: FoldedStep[] = []
  let items: FoldedToolItem[] | null = null

  const closeRun = () => {
    if (items && items.length > 0) steps.push({ kind: 'tools', items })
    items = null
  }

  for (const message of messages) {
    const blocks = shownBlocks(message)
    if (blocks.length === 0) continue

    if (blocks.some((block) => block.type === 'text')) {
      closeRun()
      steps.push({ kind: 'message', message })
      continue
    }

    items ??= []
    blocks.forEach((block, index) => {
      if (block.type === 'tool_use') items?.push({ kind: 'tool', tool: block })
      else if (block.type === 'thinking') items?.push({ kind: 'thinking', thinkingId: `${message.id ?? 'msg'}-thinking-${index}`, thinking: block.thinking })
    })
  }

  closeRun()
  return steps
}
