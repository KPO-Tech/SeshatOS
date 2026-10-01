import { describe, expect, it } from 'vitest'
import { parseReadToolContent } from './helpers'

describe('parseReadToolContent', () => {
  it('strips the File:/Lines: header and each line\'s cat -n prefix', () => {
    const raw = 'File: D:\\Hello Pulse\\plan.md\nLines: 1-3 of 3\n\n   1→# Title\n   2→\n   3→Some text\n'
    const result = parseReadToolContent(raw)
    expect(result.text).toBe('# Title\n\nSome text')
    expect(result.startLine).toBe(1)
  })

  it('reads the real starting line number for a partial read (offset)', () => {
    const raw = 'File: /repo/big.go\nLines: 41-43 of 900\n\n  41→func main() {\n  42→\t// ...\n  43→}\n'
    const result = parseReadToolContent(raw)
    expect(result.startLine).toBe(41)
    expect(result.text).toBe('func main() {\n\t// ...\n}')
  })

  it('handles a truncated read', () => {
    const raw = 'File: /repo/huge.txt\nLines: 1-2 of 50000 (truncated)\n\n1→line one\n2→line two\n'
    const result = parseReadToolContent(raw)
    expect(result.startLine).toBe(1)
    expect(result.text).toBe('line one\nline two')
  })

  it('passes unrecognized content through unchanged instead of mangling it', () => {
    const raw = 'just some plain text, not a Read tool dump'
    expect(parseReadToolContent(raw)).toEqual({ text: raw })
  })
})
