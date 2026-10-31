import { beforeEach, describe, expect, it } from 'vitest'
import { deleteNote, listNotes, noteTitle, saveNote } from './projectNotes'

// Like projects.test.ts: vitest runs here in plain node, so the only Storage the code needs is a small in-memory one.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
})

describe('project notes', () => {
  it('keeps a note with its project and gives the one changed last first', () => {
    const first = saveNote('p1', { title: 'Plan', body: 'Phase 1' }, new Date('2026-10-01T10:00:00Z'))
    saveNote('p1', { title: 'Ideas', body: 'x' }, new Date('2026-10-02T10:00:00Z'))
    saveNote('p2', { title: 'Other project', body: 'y' })
    expect(listNotes('p1').map((note) => note.title)).toEqual(['Ideas', 'Plan'])
    expect(listNotes('p2')).toHaveLength(1)
    expect(listNotes('nobody')).toEqual([])
    saveNote('p1', { id: first.id, title: 'Plan', body: 'Phase 1 and 2' }, new Date('2026-10-03T10:00:00Z'))
    expect(listNotes('p1').map((note) => note.title)).toEqual(['Plan', 'Ideas'])
  })

  it('changes a note in place and keeps the day it was made', () => {
    const made = saveNote('p1', { title: 'A', body: 'one' }, new Date('2026-10-01T10:00:00Z'))
    const changed = saveNote('p1', { id: made.id, title: 'A2', body: 'two' }, new Date('2026-10-05T10:00:00Z'))
    expect(listNotes('p1')).toHaveLength(1)
    expect(changed).toMatchObject({ id: made.id, title: 'A2', body: 'two', createdAt: made.createdAt, updatedAt: '2026-10-05T10:00:00.000Z' })
  })

  it('deletes a note and leaves the others', () => {
    const a = saveNote('p1', { title: 'A', body: '' })
    saveNote('p1', { title: 'B', body: '' })
    deleteNote('p1', a.id)
    expect(listNotes('p1').map((note) => note.title)).toEqual(['B'])
    deleteNote('p1', 'missing')
    deleteNote('p9', 'missing')
    expect(listNotes('p1')).toHaveLength(1)
  })

  it('reads what is stored for what it is worth: damaged data is no note, not an error', () => {
    localStorage.setItem('seshat.projectNotes.v1', JSON.stringify({ p1: [{ id: 'a', title: 'ok', body: '', createdAt: 'x', updatedAt: 'x' }, { id: 3 }, 'junk'], p2: 'nope' }))
    expect(listNotes('p1').map((note) => note.id)).toEqual(['a'])
    expect(listNotes('p2')).toEqual([])
    localStorage.setItem('seshat.projectNotes.v1', 'not json')
    expect(listNotes('p1')).toEqual([])
  })
})

describe('noteTitle', () => {
  it('uses the title, else the first line of the text, else a name', () => {
    expect(noteTitle({ title: 'Plan', body: 'x' })).toBe('Plan')
    expect(noteTitle({ title: '  ', body: '\n## Meeting with the agent\nmore' })).toBe('Meeting with the agent')
    expect(noteTitle({ title: '', body: 'a'.repeat(80) })).toBe(`${'a'.repeat(60)}...`)
    expect(noteTitle({ title: '', body: '' })).toBe('Untitled note')
  })
})
