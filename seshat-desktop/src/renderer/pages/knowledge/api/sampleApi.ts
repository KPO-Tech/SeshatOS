import { SAMPLE_COLLECTIONS, SAMPLE_DOCUMENTS } from './sampleData'
import type { AskEvent, AskScope, KnowledgeApi, SourceRef } from './types'

type Claim = { text: string; documentId: string; page: number; excerpt: string }
type Script = { keywords: string[]; claims: Claim[] }

// Each sample answer is a list of claims, each resting on one passage. Narrowing the scope to a collection drops the claims whose
// document lies outside it, so the answer and its sources stay consistent.
const SCRIPTS: Script[] = [
  {
    keywords: ['notice', 'terminat', 'supplier'],
    claims: [
      {
        text: 'The notice period is sixty days under the supplier contract template.',
        documentId: 'doc-supplier-template',
        page: 12,
        excerpt: 'Either party may end this agreement by giving the other party sixty (60) days written notice.'
      },
      {
        text: 'For services ordered under the logistics framework agreement it is thirty days instead.',
        documentId: 'doc-framework-logistics',
        page: 4,
        excerpt: 'the notice period is thirty (30) days instead of the period in the supplier contract template.'
      }
    ]
  },
  {
    keywords: ['remote', 'home', 'work from', 'wfh'],
    claims: [
      {
        text: 'Employees may work remotely up to three days a week, with the days agreed with their team lead.',
        documentId: 'doc-remote-policy',
        page: 2,
        excerpt: 'Employees may work remotely up to three days per week. Days in the office are agreed with the team lead'
      },
      {
        text: 'Working from another country is not covered by the policy and needs approval from People.',
        documentId: 'doc-remote-policy',
        page: 2,
        excerpt: 'Working from another country is not covered by this policy and needs approval from People.'
      }
    ]
  },
  {
    keywords: ['expense', 'reimburs', 'meal', 'receipt'],
    claims: [
      {
        text: 'Meals while travelling are reimbursed up to 35 euros a day, with the receipt.',
        documentId: 'doc-expense-policy',
        page: 3,
        excerpt: 'Meals while travelling are reimbursed up to 35 euros per day on presentation of the receipt.'
      },
      {
        text: 'A single expense above 500 euros needs the approval of a manager first, and expenses are submitted within thirty days.',
        documentId: 'doc-expense-policy',
        page: 4,
        excerpt: 'Any single expense above 500 euros needs the prior approval of a manager.'
      }
    ]
  }
]

export const SAMPLE_QUESTIONS = [
  'What is the notice period for suppliers?',
  'How many days can I work from home?',
  'What are the rules for expense reimbursement?'
]

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

function collectionOf(documentId: string): string | undefined {
  return SAMPLE_DOCUMENTS.find((doc) => doc.id === documentId)?.collectionId
}

export function pickScript(question: string): Script | null {
  const text = question.toLowerCase()
  return SCRIPTS.find((script) => script.keywords.some((keyword) => text.includes(keyword))) ?? null
}

// Builds the answer text with its numbered markers and the sources they point to. Passages used twice share one number.
export function composeAnswer(claims: Claim[]): { text: string; sources: SourceRef[] } {
  const sources: SourceRef[] = []
  const parts = claims.map((claim) => {
    let source = sources.find((item) => item.documentId === claim.documentId && item.page === claim.page && item.excerpt === claim.excerpt)
    if (!source) {
      source = { n: sources.length + 1, documentId: claim.documentId, page: claim.page, excerpt: claim.excerpt }
      sources.push(source)
    }
    return `${claim.text} [${source.n}]`
  })
  return { text: parts.join(' '), sources }
}

function chunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? []
}

async function* ask(request: { question: string; scope: AskScope }, signal: AbortSignal): AsyncGenerator<AskEvent> {
  const scoped = request.scope.collectionId
  const collections = scoped ? 1 : SAMPLE_COLLECTIONS.length
  yield { type: 'searching', collections }
  await sleep(700, signal)

  const script = pickScript(request.question)
  const claims = (script?.claims ?? []).filter((claim) => !scoped || collectionOf(claim.documentId) === scoped)

  if (claims.length === 0) {
    const where = scoped ? SAMPLE_COLLECTIONS.find((item) => item.id === scoped)?.name : null
    yield { type: 'sources', sources: [] }
    await sleep(250, signal)
    for (const piece of chunks('Nothing in the documents you can read answers this question.')) {
      await sleep(30, signal)
      yield { type: 'text', delta: piece }
    }
    yield {
      type: 'done',
      limits: {
        documentsUsed: 0,
        collectionsSearched: collections,
        notFound: where ? `No passage in ${where} matched. Try another collection or other words.` : 'No passage matched. Try other words, or look for the document by keyword.'
      }
    }
    return
  }

  const { text, sources } = composeAnswer(claims)
  yield { type: 'sources', sources }
  await sleep(450, signal)
  for (const piece of chunks(text)) {
    await sleep(28, signal)
    yield { type: 'text', delta: piece }
  }
  yield { type: 'done', limits: { documentsUsed: new Set(sources.map((source) => source.documentId)).size, collectionsSearched: collections } }
}

export const sampleKnowledgeApi: KnowledgeApi = {
  async listCollections() {
    return SAMPLE_COLLECTIONS
  },
  async getDocument(id) {
    return SAMPLE_DOCUMENTS.find((doc) => doc.id === id) ?? null
  },
  ask
}
