import { describe, expect, it, vi } from 'vitest'
import { parseUi } from '../../lang/parseUi'
import type { UiAction } from '../../lang/types'
import { siteName } from '../components/interaction'
import { actionState, actionTarget, readAction, runAction } from './richActions'

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

  it('reads a Choice with a description, drawn as a card', () => {
    const lines = [
      'root = Choices([a, b])',
      'a = Choice("Small local models", @Ask("Tell me more about small local models"), "Architecture, memory and speed")',
      'b = Choice("Agents compared", @Ask("Compare the agents"), "Cost per task")'
    ]
    const result = full(lines.join('\n'))
    expect(result.errors).toEqual([])
    const options = result.root?.props.options as Array<{ props: Record<string, unknown> }>
    const first = options[0]
    expect(first.props.description).toBe('Architecture, memory and speed')
  })

  it('reads source pills, with the name of the site when the model gives one', () => {
    const result = full('root = SourcePills([Source("Anthropic files an S-1", "https://www.reuters.com/a", null, null, "Reuters"), Source("Release notes", "https://example.com/notes")])')
    expect(result.errors).toEqual([])
    expect(result.root?.props.sources).toHaveLength(2)
  })
})

describe('actionTarget', () => {
  it('says what a button will do, whatever its label says', () => {
    expect(actionTarget(ask)).toBe('Sends: Explain the second row')
    expect(actionTarget({ kind: 'action', name: 'OpenUrl', args: ['https://example.com/a'] })).toBe('Opens: https://example.com/a')
    expect(actionTarget(openFile)).toBe('Opens the file: C:/notes/a.md')
  })

  it('has nothing to say for an action that could not be read', () => {
    expect(actionTarget(null)).toBeUndefined()
    expect(actionTarget({ kind: 'action', name: 'Ask', args: [] })).toBeUndefined()
  })

  it('cuts a very long target', () => {
    expect(actionTarget({ kind: 'action', name: 'Ask', args: ['x'.repeat(500)] })?.length).toBeLessThan(230)
  })
})

describe('siteName', () => {
  it('prefers the site the answer names, then the host of the address, then the title', () => {
    expect(siteName({ site: 'Reuters', url: 'https://www.reuters.com/a', title: 'x' })).toBe('Reuters')
    expect(siteName({ url: 'https://www.reuters.com/a', title: 'x' })).toBe('reuters.com')
    expect(siteName({ url: 'not an address', title: 'The release notes' })).toBe('The release notes')
  })
})
