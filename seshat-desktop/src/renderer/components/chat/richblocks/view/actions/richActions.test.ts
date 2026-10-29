import { describe, expect, it, vi } from 'vitest'
import { parseUi } from '../../lang/parseUi'
import type { UiAction } from '../../lang/types'
import { actionState, readAction, runAction } from './richActions'

const ask: UiAction = { kind: 'action', name: 'Ask', args: ['Explain the second row'] }
const openFile: UiAction = { kind: 'action', name: 'OpenFile', args: ['C:/notes/a.md'] }

describe('actionState', () => {
  it('lets an Ask run only with a conversation and no answer being written', () => {
    expect(actionState(ask, { ask: () => undefined, busy: false }).enabled).toBe(true)
    expect(actionState(ask, { busy: false })).toMatchObject({ enabled: false })
    expect(actionState(ask, { ask: () => undefined, busy: true })).toMatchObject({ enabled: false })
  })

  it('lets a file or an address open anywhere', () => {
    expect(actionState(openFile, { busy: true }).enabled).toBe(true)
  })

  it('refuses what could not be read', () => {
    expect(actionState(null, { busy: false }).enabled).toBe(false)
    expect(readAction('Ask')).toBeNull()
    expect(readAction({ kind: 'action', name: 'Ask', args: ['x'] })).toEqual({ kind: 'action', name: 'Ask', args: ['x'] })
  })
})

describe('runAction', () => {
  it('sends the question of an Ask as the user', () => {
    const send = vi.fn()
    runAction(ask, { ask: send, busy: false })
    expect(send).toHaveBeenCalledWith('Explain the second row')
  })

  it('sends nothing while an answer is being written', () => {
    const send = vi.fn()
    runAction(ask, { ask: send, busy: true })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('the interaction components, as the model writes them', () => {
  const full = (src: string) => parseUi(src, { streaming: false })

  it('reads Choices with their actions', () => {
    const result = full('root = Choices([a, b], "Next")\na = Choice("Compare the two", @Ask("Compare them"))\nb = Choice("Show the code", @Ask("Show the code"))')
    expect(result.errors).toEqual([])
    expect(result.root?.props.options).toHaveLength(2)
  })

  it('reads a Button that opens a file, and a FileRef in a table cell', () => {
    expect(full('root = Button("Open the notes", @OpenFile("C:/notes/a.md"), "secondary")').errors).toEqual([])
    const table = full('root = Table([Col("File"), Col("Role")], [[FileRef("src/main.go", null, null, 12), "entry"]])')
    expect(table.errors).toEqual([])
  })

  it('reads a citation and a source list', () => {
    const result = full('root = SourceList([Source("Spec", "https://example.com", null, "v2")])')
    expect(result.errors).toEqual([])
    expect(full('root = Citation("Rule 4", "handbook.pdf", "Keep it short", 12)').errors).toEqual([])
  })
})
