import { describe, expect, it } from 'vitest'
import { isFloatingColumn } from './floatingColumn'

const column = (...kinds: string[]) => ({ panels: kinds.map((kind) => ({ kind })) }) as Parameters<typeof isFloatingColumn>[0]
const showing = (focusToolId: string) => ({ panels: [{ kind: 'computer', focusToolId }] }) as unknown as Parameters<typeof isFloatingColumn>[0]

describe('isFloatingColumn', () => {
  it('is true for a column that holds only the session cards', () => {
    expect(isFloatingColumn(column('computer'))).toBe(true)
  })

  it('is false once a document, a file or a terminal shares the column', () => {
    expect(isFloatingColumn(column('computer', 'pdf'))).toBe(false)
    expect(isFloatingColumn(column('files'))).toBe(false)
    expect(isFloatingColumn(column('shell'))).toBe(false)
  })

  it('is false once the session panel shows a tool, which has a width to give it', () => {
    expect(isFloatingColumn(showing('tool-1'))).toBe(false)
  })

  it('is false for an empty column', () => {
    expect(isFloatingColumn(column())).toBe(false)
  })
})
