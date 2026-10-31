import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { languageForPath } from '@renderer/components/chat/tools/helpers'
import { MarkdownView } from './MarkdownView'

const draw = (text: string) => renderToStaticMarkup(createElement(MarkdownView, { variant: 'document', children: text }))

describe('a document page with HTML', () => {
  it('draws the layout HTML of a README and keeps its alignment', () => {
    const html = draw('<p align="center"><em>Keep</em> this</p>\n\n<h1 align="center">Title</h1>\n\n<details><summary>More</summary>hidden</details>')
    expect(html).toContain('text-align:center')
    expect(html).toContain('<em>Keep</em>')
    expect(html).toContain('<details>')
  })

  it('removes scripts, event handlers and frames', () => {
    const html = draw('<script>alert(1)</script><p onclick="x()">hi</p><iframe src="https://e.x"></iframe><a href="javascript:alert(1)">l</a>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('javascript:')
  })

  it('still draws formulas and code', () => {
    expect(draw('$x^2$')).toContain('katex')
    expect(draw('```go\nfunc main() {}\n```')).toContain('main')
  })
})

describe('languageForPath', () => {
  it('knows the files that are named by what they are, and the shell ones', () => {
    expect(languageForPath('D:' + String.fromCharCode(92) + 'p' + String.fromCharCode(92) + 'Makefile')).toBe('makefile')
    expect(languageForPath('build.mk')).toBe('makefile')
    expect(languageForPath('run.ps1')).toBe('powershell')
    expect(languageForPath('x.sh')).toBe('bash')
    expect(languageForPath('a.cpp')).toBe('cpp')
    expect(languageForPath('main.go')).toBe('go')
    expect(languageForPath('notes.xyz')).toBeUndefined()
  })
})
