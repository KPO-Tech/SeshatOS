import { Info } from '@icon-park/react'
import type { AnswerExtras } from '@renderer/components/chat/messages/answerExtras'
import { SourcesDisclosure } from '@renderer/components/sources/SourcesDisclosure'
import { citedRefs, prepareAnswer, refOfHref } from '../chat/answerText'
import { passagesOfResult, type Passage } from '../chat/knowledgeSearchResults'
import { groupPassages } from '../chat/passageSources'
import { CitationChip } from '../components/CitationChip'
import { passageSourceItems } from '../components/passageSourceItems'

const SEARCH_TOOL = 'knowledge_search'

// How a passage is opened: from a citation of the answer (at the cited place) or from the list of documents under it (the document).
export type OpenHow = 'cited' | 'source'

type BlockLike = { type: string }
type MessageLike = { role: string; content: ReadonlyArray<BlockLike> }
type SearchBlock = BlockLike & { name: string; _result?: { content?: string; metadata?: Record<string, unknown> } }

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const isSearch = (block: BlockLike): block is SearchBlock => block.type === 'tool_use' && (block as SearchBlock).name === SEARCH_TOOL

const textOf = (message: MessageLike) =>
  message.content.map((block) => (block.type === 'text' ? ((block as BlockLike & { text?: string }).text ?? '') : '')).join('')

function AnswerBasis({ basis, searched, collections, onOpen, scopeName }: { basis: Passage[]; searched: boolean; collections: number | null; onOpen: (passage: Passage, how: OpenHow) => void; scopeName: string | null }) {
  if (basis.length > 0) {
    const documents = groupPassages(basis).length
    return (
      <SourcesDisclosure
        items={passageSourceItems(basis, null, (passage) => onOpen(passage, 'source'))}
        label={
          <span className="inline-flex items-center gap-1.5">
            <Info size={13} />
            {`Based on ${plural(documents, 'document', 'documents')}${collections ? ` among ${plural(collections, 'collection', 'collections')} you can read` : ''}`}
          </span>
        }
      />
    )
  }
  if (!searched) return null
  return (
    <p className="m-0 rounded-lg border border-solid border-[color-mix(in_srgb,var(--accent-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-warning)_10%,transparent)] px-3 py-2 text-[12.5px] leading-[18px] text-[var(--text-secondary)]">
      {scopeName ? `No passage in ${scopeName} matched. Try another collection or other words.` : 'No passage matched. Try other words, or look for the document by keyword.'}
    </p>
  )
}

/**
 * What the Ask view adds to the messages of the chat, one entry per message (undefined for those that get nothing): the citations of
 * an answer as chips, and under the message that ends a turn the documents the answer rests on. The passages come from the searches of the
 * turn the message belongs to, read from the results the tool calls carry.
 */
export function askExtras(messages: ReadonlyArray<MessageLike>, scopeName: string | null, onOpen: (passage: Passage, how: OpenHow) => void): Array<AnswerExtras | undefined> {
  const extras: Array<AnswerExtras | undefined> = Array.from({ length: messages.length }, () => undefined)
  let turnStart = 0

  messages.forEach((message, index) => {
    if (message.role === 'user' && message.content.some((block) => block.type === 'text')) {
      turnStart = index + 1
      return
    }
    if (message.role !== 'assistant') return

    // What the turn has found up to this message, once each, and how many collections the searches went through.
    const found: Passage[] = []
    let searched = false
    let collections: number | null = null
    for (let i = turnStart; i <= index; i++) {
      if (messages[i].role !== 'assistant') continue
      for (const block of messages[i].content) {
        if (!isSearch(block)) continue
        searched = true
        for (const passage of passagesOfResult(block._result?.content, block._result?.metadata)) {
          if (!found.some((known) => known.ref === passage.ref)) found.push(passage)
        }
        const count = block._result?.metadata?.corpora_searched
        if (typeof count === 'number') collections = Math.max(collections ?? 0, count)
      }
    }

    const known = new Set(found.map((passage) => passage.ref))
    const endsTurn = messages[index + 1]?.role !== 'assistant'
    let footer: AnswerExtras['footer']
    if (endsTurn) {
      const answer = messages.slice(turnStart, index + 1).filter((item) => item.role === 'assistant').map(textOf).join('')
      const byRef = new Map(found.map((passage) => [passage.ref, passage]))
      const cited = citedRefs(answer).flatMap((ref) => byRef.get(ref) ?? [])
      if (searched || found.length > 0) footer = <AnswerBasis basis={cited.length > 0 ? cited : found} searched={searched} collections={collections} onOpen={onOpen} scopeName={scopeName} />
    }

    extras[index] = {
      prepare: (text) => prepareAnswer(text, known),
      renderLink: (href) => {
        const ref = refOfHref(href)
        const passage = ref ? found.find((item) => item.ref === ref) : undefined
        return passage ? <CitationChip passage={passage} onOpen={() => onOpen(passage, 'cited')} /> : null
      },
      footer
    }
  })
  return extras
}
