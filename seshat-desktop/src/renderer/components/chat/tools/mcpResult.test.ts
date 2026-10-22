import { beforeEach, describe, expect, it } from 'vitest'
import { connectorKind, serverLabel, setConnectorLabels } from './connectorNames'
import { formatMcpResult } from './mcpResult'

describe('formatMcpResult', () => {
  it('indents compact JSON', () => {
    expect(formatMcpResult('{"a":1,"b":[2,3]}')).toEqual({ text: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}', language: 'json' })
  })

  it('leaves plain text alone', () => {
    expect(formatMcpResult('3 issues found')).toEqual({ text: '3 issues found' })
  })

  it('leaves text that only looks like JSON alone', () => {
    expect(formatMcpResult('{not json')).toEqual({ text: '{not json' })
  })

  it('unwraps a single text content block that holds JSON', () => {
    const wrapped = JSON.stringify([{ type: 'text', text: '{"id":7}' }])
    expect(formatMcpResult(wrapped)).toEqual({ text: '{\n  "id": 7\n}', language: 'json' })
  })

  it('joins several text content blocks', () => {
    const wrapped = JSON.stringify([{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }])
    expect(formatMcpResult(wrapped)).toEqual({ text: 'first\n\nsecond' })
  })

  it('does not unwrap an array that is not made of text blocks', () => {
    const list = JSON.stringify([{ type: 'image' }, { type: 'text', text: 'x' }])
    expect(formatMcpResult(list).language).toBe('json')
  })

  it('does not reformat a very large answer', () => {
    const big = JSON.stringify({ data: 'x'.repeat(250_000) })
    expect(formatMcpResult(big)).toEqual({ text: big })
  })
})

describe('connector names', () => {
  beforeEach(() => setConnectorLabels({ github: 'GitHub' }))

  it('finds the kind behind a connector server', () => {
    expect(connectorKind('connector-github')).toBe('github')
    expect(connectorKind('connector-')).toBeNull()
    expect(connectorKind('my-own-server')).toBeNull()
  })

  it('names a connector by its label and any other server as configured', () => {
    expect(serverLabel('connector-github')).toBe('GitHub')
    expect(serverLabel('my-own-server')).toBe('my-own-server')
  })

  it('falls back to the capitalised kind when the label is not loaded', () => {
    expect(serverLabel('connector-linear')).toBe('Linear')
  })
})
