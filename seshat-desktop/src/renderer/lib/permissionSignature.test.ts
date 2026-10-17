import { describe, expect, it } from 'vitest'
import { permissionSignature } from './permissionSignature'

describe('permissionSignature', () => {
  it('matches a bash command on its literal text, ignoring surrounding whitespace', () => {
    expect(permissionSignature('bash', { command: '  ls -la ' })).toBe(permissionSignature('bash', { command: 'ls -la' }))
    expect(permissionSignature('bash', { command: 'ls' })).not.toBe(permissionSignature('bash', { command: 'ls -la' }))
  })

  it('never lets one edit of a file approve a different edit of the same file', () => {
    const a = permissionSignature('edit_file', { file_path: 'a.ts', old_string: 'x', new_string: 'y' })
    const b = permissionSignature('edit_file', { file_path: 'a.ts', old_string: 'x', new_string: 'rm -rf' })
    expect(a).not.toBe(b)
  })

  it('never lets one write of a file approve different content', () => {
    const a = permissionSignature('write_file', { file_path: 'a.ts', content: 'one' })
    const b = permissionSignature('write_file', { file_path: 'a.ts', content: 'two' })
    expect(a).not.toBe(b)
  })

  it('keeps tools apart: the same path under another tool is another signature', () => {
    expect(permissionSignature('read_file', { file_path: 'a.ts' })).not.toBe(permissionSignature('delete_file', { file_path: 'a.ts' }))
  })

  it('falls back to the whole input, and to the tool name when it cannot be serialized', () => {
    expect(permissionSignature('web_fetch', { url: 'https://a' })).not.toBe(permissionSignature('web_fetch', { url: 'https://b' }))
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(permissionSignature('weird', circular)).toBe('weird')
  })
})
