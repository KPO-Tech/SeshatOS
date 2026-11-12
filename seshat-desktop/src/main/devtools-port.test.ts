import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseDevToolsPort, readDevToolsPort } from './devtools-port'

describe('parseDevToolsPort', () => {
  it('reads the port on the first line', () => {
    expect(parseDevToolsPort('49425\n/devtools/browser/ebbb05fc')).toBe(49425)
  })

  it.each(['', 'abc\n/x', '0\n', '70000\n'])('gives 0 for %j', (content) => {
    expect(parseDevToolsPort(content)).toBe(0)
  })
})

describe('readDevToolsPort', () => {
  it('waits for the file and reads it', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'devtools-port-')), 'DevToolsActivePort')
    setTimeout(() => writeFileSync(file, '51234\n/devtools/browser/x'), 100)
    await expect(readDevToolsPort(file, 2000)).resolves.toBe(51234)
  })

  it('gives 0 when the file never comes', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'devtools-port-')), 'DevToolsActivePort')
    await expect(readDevToolsPort(file, 200)).resolves.toBe(0)
  })
})
