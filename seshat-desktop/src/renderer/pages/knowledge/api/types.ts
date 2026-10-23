export type FileKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'md'

export type KnowledgeCollection = {
  id: string
  name: string
  description: string
  documentCount: number
}

export type DocumentPage = { number: number; text: string }

export type KnowledgeDocument = {
  id: string
  name: string
  kind: FileKind
  collectionId: string
  source: string
  updatedAt: string
  pageCount: number
  // The pages the viewer can show: the cited one and its neighbours.
  pages: DocumentPage[]
}

// One numbered source of an answer: the passage, where it sits, and the document it comes from.
export type SourceRef = {
  n: number
  documentId: string
  page: number
  excerpt: string
}

// What the answer rests on, and what it could not find. Only facts the server knows.
export type AnswerLimits = {
  documentsUsed: number
  collectionsSearched: number
  notFound?: string
}

export type AskScope = { collectionId: string | null }

export type AskEvent =
  | { type: 'searching'; collections: number }
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'text'; delta: string }
  | { type: 'done'; limits: AnswerLimits }

// The shape the Knowledge pages depend on. The sample implementation answers from a few made-up documents; the real one will call the
// local backend, which reaches SeshatCloud in connected mode.
export type KnowledgeApi = {
  listCollections(): Promise<KnowledgeCollection[]>
  getDocument(id: string): Promise<KnowledgeDocument | null>
  ask(request: { question: string; scope: AskScope }, signal: AbortSignal): AsyncIterable<AskEvent>
}
