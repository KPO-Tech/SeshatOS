// The notes of a project: short texts in Markdown that the person keeps with it. Like the rest of what a project says about itself they are
// kept on this computer, by the id of the project (see projects.ts).

const NOTES_STORAGE_KEY = 'seshat.projectNotes.v1'

export type ProjectNote = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

type Store = Record<string, ProjectNote[]>

function isNote(value: unknown): value is ProjectNote {
  if (typeof value !== 'object' || value === null) return false
  const note = value as Record<string, unknown>
  return typeof note.id === 'string' && typeof note.title === 'string' && typeof note.body === 'string' && typeof note.createdAt === 'string' && typeof note.updatedAt === 'string'
}

function read(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const store: Store = {}
    for (const [projectId, notes] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(notes)) store[projectId] = notes.filter(isNote)
    }
    return store
  } catch {
    return {}
  }
}

function write(store: Store) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(store))
}

/** The notes of a project, the one changed last first. */
export function listNotes(projectId: string): ProjectNote[] {
  return [...(read()[projectId] ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function newId(): string {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Keeps a note: a new one when it has no id (or an id that is not there), the one with that id otherwise. */
export function saveNote(projectId: string, draft: { id?: string; title: string; body: string }, now: Date = new Date()): ProjectNote {
  const store = read()
  const notes = store[projectId] ?? []
  const at = now.toISOString()
  const index = draft.id ? notes.findIndex((note) => note.id === draft.id) : -1
  const note: ProjectNote =
    index >= 0
      ? { ...notes[index], title: draft.title, body: draft.body, updatedAt: at }
      : { id: draft.id ?? newId(), title: draft.title, body: draft.body, createdAt: at, updatedAt: at }
  store[projectId] = index >= 0 ? notes.map((item, i) => (i === index ? note : item)) : [...notes, note]
  write(store)
  return note
}

export function deleteNote(projectId: string, id: string): void {
  const store = read()
  if (!store[projectId]) return
  store[projectId] = store[projectId].filter((note) => note.id !== id)
  if (store[projectId].length === 0) delete store[projectId]
  write(store)
}

/** What a note is called in a list: its title, else the start of its text, else a name for an empty one. */
export function noteTitle(note: Pick<ProjectNote, 'title' | 'body'>): string {
  const title = note.title.trim()
  if (title) return title
  const line = note.body.split('\n').map((text) => text.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean)
  return line ? (line.length > 60 ? `${line.slice(0, 60)}...` : line) : 'Untitled note'
}
