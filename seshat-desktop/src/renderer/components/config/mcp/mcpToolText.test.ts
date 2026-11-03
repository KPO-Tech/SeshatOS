import { describe, expect, it } from 'vitest'
import { filterTools, hasToolDetails, toolSummary, toolTextBlocks } from './mcpToolText'

// The start of what huggingface.co/mcp says about hf_fs: one block with JSON examples inside the prose.
const HF_FS =
  'When to use: Hugging Face Hub models, datasets and papers. Examples: {"operations":[{"cmd":"ls","args":["hf://models/trending","--limit","10"]}]} {"operations":[{"cmd":"cat","args":["hf://papers/2501.00001/paper.md"]}]} Use hf_fs for Hub filesystem operations. Issue one hf_fs call.'

describe('toolSummary', () => {
  it('is the first sentence', () => {
    expect(toolSummary(HF_FS)).toBe('When to use: Hugging Face Hub models, datasets and papers.')
  })

  it('does not stop inside a word or a version', () => {
    expect(toolSummary('Reads node.js files from v1.2 folders. Then stops.')).toBe('Reads node.js files from v1.2 folders.')
  })

  it('takes a description with no full stop whole, and copes with none', () => {
    expect(toolSummary('Searches the hub')).toBe('Searches the hub')
    expect(toolSummary(undefined)).toBe('')
  })
})

describe('hasToolDetails', () => {
  it('is true only when there is more than the summary', () => {
    expect(hasToolDetails(HF_FS)).toBe(true)
    expect(hasToolDetails('One sentence.')).toBe(false)
    expect(hasToolDetails(undefined)).toBe(false)
  })
})

describe('toolTextBlocks', () => {
  it('puts each sentence and each JSON example on its own', () => {
    expect(toolTextBlocks(HF_FS)).toEqual([
      { kind: 'text', value: 'When to use: Hugging Face Hub models, datasets and papers.' },
      { kind: 'text', value: 'Examples:' },
      { kind: 'code', value: '{"operations":[{"cmd":"ls","args":["hf://models/trending","--limit","10"]}]}' },
      { kind: 'code', value: '{"operations":[{"cmd":"cat","args":["hf://papers/2501.00001/paper.md"]}]}' },
      { kind: 'text', value: 'Use hf_fs for Hub filesystem operations.' },
      { kind: 'text', value: 'Issue one hf_fs call.' }
    ])
  })

  it('counts no brace inside a string, and leaves JSON that never closes as text', () => {
    expect(toolTextBlocks('See {"a":"}"} now')).toEqual([
      { kind: 'text', value: 'See' },
      { kind: 'code', value: '{"a":"}"}' },
      { kind: 'text', value: 'now' }
    ])
    expect(toolTextBlocks('Bad {"a":1')).toEqual([{ kind: 'text', value: 'Bad {"a":1' }])
  })

  it('keeps the lines a server wrote', () => {
    expect(toolTextBlocks('First line\nSecond line')).toEqual([
      { kind: 'text', value: 'First line' },
      { kind: 'text', value: 'Second line' }
    ])
  })
})

describe('filterTools', () => {
  const tools = [{ name: 'hf_whoami', description: 'Inspect the account' }, { name: 'hub_repo_search' }]

  it('matches a name or a description, whatever the case', () => {
    expect(filterTools(tools, 'REPO').map((tool) => tool.name)).toEqual(['hub_repo_search'])
    expect(filterTools(tools, 'account').map((tool) => tool.name)).toEqual(['hf_whoami'])
  })

  it('keeps everything for an empty search', () => {
    expect(filterTools(tools, '  ')).toEqual(tools)
  })
})
