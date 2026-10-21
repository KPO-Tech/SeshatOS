import { describe, expect, it } from 'vitest'
import { srtEntryScript, srtUnixLauncher, srtWindowsLauncher } from './srt-launcher'

describe('srtEntryScript', () => {
  it('marks the process as a default app before loading the CLI, so its own path is not read as an argument', () => {
    const script = srtEntryScript('D:\\app\\cli.js')
    expect(script.indexOf('process.defaultApp = true')).toBeGreaterThanOrEqual(0)
    expect(script.indexOf('process.defaultApp = true')).toBeLessThan(script.indexOf('import('))
  })

  it('writes the path of the CLI as a string a script can read back, backslashes and spaces included', () => {
    const script = srtEntryScript('C:\\Program Files\\My App\\cli.js')
    const literal = script.match(/pathToFileURL\((.*)\)\.href/)?.[1] ?? ''
    expect(JSON.parse(literal)).toBe('C:\\Program Files\\My App\\cli.js')
  })

  it('exits with an error when the CLI cannot be loaded, rather than silently doing nothing', () => {
    expect(srtEntryScript('/x/cli.js')).toContain('process.exit(1)')
  })
})

describe('launchers', () => {
  it('start the entry script with Electron as Node and pass every argument on', () => {
    expect(srtWindowsLauncher('C:\\app\\electron.exe', 'C:\\bin\\srt-entry.cjs')).toBe(
      '@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"C:\\app\\electron.exe" "C:\\bin\\srt-entry.cjs" %*\r\n'
    )
    const unix = srtUnixLauncher('/app/electron', '/bin/srt-entry.cjs')
    expect(unix).toContain('ELECTRON_RUN_AS_NODE=1 exec "/app/electron" "/bin/srt-entry.cjs" "$@"')
    expect(unix.startsWith('#!/bin/sh\n')).toBe(true)
  })
})
