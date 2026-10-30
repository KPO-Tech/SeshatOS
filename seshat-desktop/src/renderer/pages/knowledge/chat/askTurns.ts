import { citedRefs } from './answerText'
import { parseKnowledgeSearchResult, type Passage } from './knowledgeSearchResults'

const SEARCH_TOOL = 'knowledge_search'

type BlockLike = { type: string }
type MessageLike = { role: string; content: ReadonlyArray<BlockLike>; status?: string }

type ToolBlock = BlockLike & {
  name: string
  _result?: { content?: string; isError?: boolean; metadata?: Record<string, unknown> }
}

export type TurnPhase = 'searching' | 'writing' | 'done' | 'error'

// One question of the Ask conversation and what the agent did with it, read from the messages of the chat.
export type AskTurn = {
  id: string
  question: string
  phase: TurnPhase
  // A search is running.
  searching: boolean
  searches: number
  // How many collections the searches went through, when the tool said.
  collectionsSearched: number | null
  // Every excerpt the searches returned, once each, in the order they came.
  passages: Passage[]
  text: string
  // The excerpts the text cites, in the order of the text.
  cited: Passage[]
  // The turn failed (the chat marks the question as not sent): the text then holds the reason the chat wrote.
  failed: boolean
}

function textOf(blocks: ReadonlyArray<BlockLike>): string {
  return blocks
    .filter((block): block is BlockLike & { text: string } => block.type === 'text' && typeof (block as { text?: unknown }).text === 'string')
    .map((block) => block.text)
    .join('')
}

const isToolBlock = (block: BlockLike): block is ToolBlock => block.type === 'tool_use'

// A message that only carries tool results is not a question.
function isQuestion(message: MessageLike): boolean {
  return message.role === 'user' && message.content.some((block) => block.type === 'text' && textOf([block]).trim() !== '')
}

/** The questions of the conversation, each with the excerpts found for it and the answer written so far. */
export function deriveTurns(messages: ReadonlyArray<MessageLike & { id?: string }>, streaming: boolean): AskTurn[] {
  const turns: AskTurn[] = []
  let current: AskTurn | null = null
  const finish = () => {
    if (!current) return
    const byRef = new Map(current.passages.map((passage) => [passage.ref, passage]))
    current.cited = citedRefs(current.text).flatMap((ref) => byRef.get(ref) ?? [])
    turns.push(current)
    current = null
  }

  messages.forEach((message, index) => {
    if (isQuestion(message)) {
      finish()
      current = {
        id: message.id ?? `turn-${index}`,
        question: textOf(message.content).trim(),
        phase: 'done',
        searching: false,
        searches: 0,
        collectionsSearched: null,
        passages: [],
        text: '',
        cited: [],
        failed: message.status === 'error'
      }
      return
    }
    if (!current || message.role !== 'assistant') return
    for (const block of message.content) {
      if (isToolBlock(block) && block.name === SEARCH_TOOL) {
        current.searches += 1
        if (!block._result) {
          current.searching = true
          continue
        }
        for (const passage of parseKnowledgeSearchResult(block._result.content)) {
          if (!current.passages.some((known) => known.ref === passage.ref)) current.passages.push(passage)
        }
        const searched = block._result.metadata?.corpora_searched
        if (typeof searched === 'number') current.collectionsSearched = Math.max(current.collectionsSearched ?? 0, searched)
      }
    }
    current.text += textOf(message.content)
  })
  finish()

  const last = turns.at(-1)
  for (const turn of turns) if (turn.failed) turn.phase = 'error'
  if (last && streaming && !last.failed) last.phase = last.text.trim() === '' ? 'searching' : 'writing'
  if (last && !streaming) last.searching = false
  return turns
}
