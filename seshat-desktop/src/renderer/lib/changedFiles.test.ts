import { describe, expect, it } from 'vitest'
import { changedFilesByTurnEnd, collectChangedFiles } from './changedFiles'
import { fileIconName } from './fileIcon'

const tool = (id: string, name: string, file_path: string, meta: Record<string, unknown> = {}, isError = false) => ({
  type: 'tool_use' as const,
  id,
  name,
  input: { file_path },
  _result: { isError, metadata: meta }
})
const assistant = (...content: Array<{ type: string }>) => ({ role: 'assistant', content })
const user = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] })
const text = (t: string) => ({ type: 'text', text: t })

describe('collectChangedFiles', () => {
  it('lists created and modified files with their line counts', () => {
    const files = collectChangedFiles([
      assistant(
        tool('1', 'write_file', 'C:\\proj\\notes.md', { type: 'create', lines_added: 12 }),
        tool('2', 'edit_file', '/proj/main.py', { lines_added: 3, lines_removed: 1 })
      )
    ])
    expect(files).toEqual([
      { path: 'C:\\proj\\notes.md', name: 'notes.md', status: 'created', linesAdded: 12, linesRemoved: 0, toolId: '1' },
      { path: '/proj/main.py', name: 'main.py', status: 'modified', linesAdded: 3, linesRemoved: 1, toolId: '2' }
    ])
  })

  it('merges repeated changes to one file, and a created file stays created', () => {
    const files = collectChangedFiles([
      assistant(tool('1', 'write_file', '/p/a.ts', { type: 'create', lines_added: 10 })),
      assistant(tool('2', 'edit_file', '/p/a.ts', { lines_added: 2, lines_removed: 1 }))
    ])
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ status: 'created', linesAdded: 12, linesRemoved: 1, toolId: '2' })
  })

  it('ignores failed or unfinished calls, reads and other tools', () => {
    const unfinished = { ...tool('3', 'write_file', '/p/c.ts'), _result: undefined }
    expect(
      collectChangedFiles([
        assistant(tool('1', 'write_file', '/p/a.ts', {}, true), unfinished, tool('4', 'read_file', '/p/d.ts'), tool('5', 'bash', '/p/e.ts'))
      ])
    ).toEqual([])
  })
})

describe('changedFilesByTurnEnd', () => {
  const messages = [
    user('write a note'),
    assistant(tool('1', 'write_file', '/p/note.md', { type: 'create' })),
    assistant(text('Done, the note is in note.md')),
    user('and a script'),
    assistant(tool('2', 'write_file', '/p/run.py', { type: 'create' })),
    assistant(text('Here it is'))
  ]

  it('attaches the files of a turn to the last message of that turn', () => {
    const byTurn = changedFilesByTurnEnd(messages, false)
    expect([...byTurn.keys()]).toEqual([2, 5])
    expect(byTurn.get(2)?.map((f) => f.name)).toEqual(['note.md'])
    expect(byTurn.get(5)?.map((f) => f.name)).toEqual(['run.py'])
  })

  it('waits for the end of the answer while it is still streaming', () => {
    const byTurn = changedFilesByTurnEnd(messages, true)
    expect([...byTurn.keys()]).toEqual([2])
  })
})

describe('fileIconName', () => {
  it('picks the icon by file name first, then by extension', () => {
    expect(fileIconName('/p/main.py')).toBe('python')
    expect(fileIconName('C:\\p\\App.TSX')).not.toBe('file')
    expect(fileIconName('/p/notes.md')).toBe('markdown')
    expect(fileIconName('/p/report.pdf')).toBe('pdf')
    expect(fileIconName('/p/Dockerfile')).not.toBe('file')
    expect(fileIconName('/p/package.json')).not.toBe('file')
  })

  it('falls back to a plain file icon', () => {
    expect(fileIconName('/p/unknown.zzz')).toBe('file')
    expect(fileIconName('/p/noextension')).toBe('file')
  })
})
