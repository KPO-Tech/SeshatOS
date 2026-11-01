import { describe, expect, it } from 'vitest'
import { descriptionFromReadme } from './readmeDescription'

describe('descriptionFromReadme', () => {
  it('takes the first sentence of the first paragraph, after the title', () => {
    const readme = '# Sankofa\n\nSankofa est une application mobile qui aide les familles de la diaspora africaine à préserver et transmettre leur mémoire familiale. Elle propose un arbre généalogique.\n\n## Installation\n\nnpm install'
    expect(descriptionFromReadme(readme)).toBe('Sankofa est une application mobile qui aide les familles de la diaspora africaine à préserver et transmettre leur mémoire familiale.')
  })

  it('passes over badges, pictures, html and a table of contents', () => {
    const readme = [
      '# Project',
      '',
      '[![Build](https://img.shields.io/x.svg)](https://ci.example) [![License](https://img.shields.io/y.svg)](LICENSE)',
      '',
      '<p align="center"><img src="logo.png"></p>',
      '',
      '![banner](banner.png)',
      '',
      '- [Install](#install)',
      '- [Usage](#usage)',
      '',
      'A small tool to sort the photos of a family archive by date.'
    ].join('\n')
    expect(descriptionFromReadme(readme)).toBe('A small tool to sort the photos of a family archive by date.')
  })

  it('reads a quoted tagline, and keeps the words of links and emphasis', () => {
    expect(descriptionFromReadme('# Tool\n\n> **Tool** turns your [notes](https://example.com/notes) into a `searchable` index.')).toBe('Tool turns your notes into a searchable index.')
  })

  it('passes over a title underlined, a front matter, comments and code', () => {
    const readme = '---\ntitle: x\n---\n\nMy project\n==========\n\n<!-- a comment -->\n\n```bash\nnpm run build\n```\n\nThis project helps teams plan their releases without a spreadsheet.'
    expect(descriptionFromReadme(readme)).toBe('This project helps teams plan their releases without a spreadsheet.')
  })

  it('does not stop at an abbreviation or a version number', () => {
    expect(descriptionFromReadme('# X\n\nA library for tools, e.g. parsers and linters, since v1.2 of the standard. It is small.')).toBe(
      'A library for tools, e.g. parsers and linters, since v1.2 of the standard.'
    )
  })

  it('shortens a very long sentence at a word', () => {
    const long = `# X\n\n${'A project that does many different useful things for people '.repeat(8)}end.`
    const got = descriptionFromReadme(long, 100)
    expect(got.length).toBeLessThanOrEqual(103)
    expect(got.endsWith('...')).toBe(true)
    expect(got).not.toMatch(/\s\.\.\.$/)
  })

  it('says nothing when there is no sentence to take', () => {
    expect(descriptionFromReadme('')).toBe('')
    expect(descriptionFromReadme('# Only a title')).toBe('')
    expect(descriptionFromReadme('# T\n\nv1.2.3\n\n```\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |')).toBe('')
  })

  it('reads a file with a byte order mark and Windows line ends', () => {
    expect(descriptionFromReadme('﻿# Titre\r\n\r\nUne application pour suivre les dépenses du foyer.\r\n')).toBe('Une application pour suivre les dépenses du foyer.')
  })
})
