import { describe, expect, it } from 'vitest'
import { dataURLText, htmlArtifactPanel, isHtmlPath, presentedPages } from './htmlArtifact'

const present = (id: string, payload: Record<string, unknown>, status = 'completed', isError = false) => ({
  type: 'tool_use',
  id,
  name: 'present_artifact',
  _status: status,
  _result: { content: JSON.stringify(payload), isError },
})

describe('isHtmlPath', () => {
  it('knows a web page by its extension', () => {
    expect(isHtmlPath('out/aco-interactive.html')).toBe(true)
    expect(isHtmlPath('C:\\work\\INDEX.HTM')).toBe(true)
    expect(isHtmlPath('notes.md')).toBe(false)
    expect(isHtmlPath('page.html.bak')).toBe(false)
  })
})

describe('htmlArtifactPanel', () => {
  it('names the panel after the title, or the file when there is none', () => {
    expect(htmlArtifactPanel('s1', 'a/b/page.html')).toEqual({ kind: 'artifact', title: 'page.html', sessionId: 's1', artifactPath: 'a/b/page.html' })
    expect(htmlArtifactPanel('s1', 'page.html', 'ACO simulation').title).toBe('ACO simulation')
  })
})

describe('dataURLText', () => {
  it('decodes base64 as UTF-8', () => {
    const html = '<p>Phéromones α β ρ</p>'
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(html)))
    expect(dataURLText(`data:text/html;base64,${base64}`)).toBe(html)
  })

  it('decodes a percent-encoded body', () => {
    expect(dataURLText('data:text/html,%3Cp%3Ehi%3C%2Fp%3E')).toBe('<p>hi</p>')
  })

  it('refuses anything else', () => {
    expect(() => dataURLText('https://example.com')).toThrow()
  })
})

describe('presentedPages', () => {
  it('keeps the finished web pages only', () => {
    const blocks = [
      { type: 'text' },
      present('t1', { path: 'aco.html', kind: 'html', title: 'ACO' }),
      present('t2', { path: 'chart.png', kind: 'image' }),
      present('t3', { path: 'running.html', kind: 'html' }, 'running'),
      present('t4', { path: 'broken.html', kind: 'html' }, 'completed', true),
      present('t5', { path: 'site/index.htm' }),
    ]
    expect(presentedPages(blocks)).toEqual([
      { toolId: 't1', path: 'aco.html', title: 'ACO' },
      { toolId: 't5', path: 'site/index.htm', title: undefined },
    ])
  })

  it('ignores other tools', () => {
    expect(presentedPages([{ type: 'tool_use', id: 'w', name: 'write_file', _status: 'completed', _result: { content: '{"path":"a.html"}', isError: false } }])).toEqual([])
  })
})
