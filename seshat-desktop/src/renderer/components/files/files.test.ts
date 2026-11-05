import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { FileContentView } from './FileContentView'
import { FileTreeView } from './FileTreeView'
import { treeFileSource, type TreeLike } from './fileSource'

const nodes: TreeLike[] = [
  { name: 'SKILL.md', path: 'SKILL.md', is_dir: false },
  {
    name: 'references',
    path: 'references',
    is_dir: true,
    children: [
      { name: 'formats.md', path: 'references/formats.md', is_dir: false },
      { name: 'more', path: 'references/more', is_dir: true, children: [{ name: 'deep.csv', path: 'references/more/deep.csv', is_dir: false }] }
    ]
  }
]

async function instanceIn(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return instance
}

describe('the files of a tree held in memory', () => {
  const source = treeFileSource(nodes, 'my-skill')

  it('lists a folder, from the top and from a path', async () => {
    expect(await source.list('')).toEqual([
      { name: 'SKILL.md', isDirectory: false },
      { name: 'references', isDirectory: true }
    ])
    expect((await source.list('references')).map((entry) => entry.name)).toEqual(['formats.md', 'more'])
    expect(await source.list('nowhere')).toEqual([])
  })

  it('writes the path of an entry from the path of its folder', () => {
    expect(source.join('', 'SKILL.md')).toBe('SKILL.md')
    expect(source.join('references', 'formats.md')).toBe('references/formats.md')
  })

  it('finds a name at any depth, whatever the case', async () => {
    const found = await source.search?.('DEEP')
    expect(found).toEqual([{ path: 'references/more/deep.csv', relativePath: 'references/more/deep.csv', name: 'deep.csv', isDirectory: false }])
  })
})

describe('the shared views of files in each language', () => {
  it('draws the tree in French, with a search when the source has one', async () => {
    const instance = await instanceIn('fr')
    const html = renderToStaticMarkup(
      createElement(I18nextProvider, { i18n: instance }, createElement(FileTreeView, { source: treeFileSource(nodes, 'my-skill'), title: 'Fichiers du skill', selectedPath: null, onOpenFile: () => undefined }))
    )
    expect(html).toContain('Fichiers du skill')
    expect(html).toContain('Chercher un fichier…')
    expect(html).toContain('my-skill')
    expect(html).not.toContain('files:')
  })

  it('draws no search when the source cannot search, and no refresh without a handler', async () => {
    const instance = await instanceIn('en')
    const { search: _search, ...withoutSearch } = treeFileSource(nodes, 'my-skill')
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(FileTreeView, { source: withoutSearch, title: 'Files', selectedPath: null, onOpenFile: () => undefined })))
    expect(html).not.toContain('Search files')
    expect(html).not.toContain('Read the files again')
  })

  it('says in French that a kind of file is not drawn, and offers nothing it cannot do', async () => {
    const instance = await instanceIn('fr')
    const html = renderToStaticMarkup(
      createElement(I18nextProvider, { i18n: instance }, createElement(FileContentView, { path: 'a/report.docx', relativePath: 'a/report.docx', readText: () => Promise.resolve('') }))
    )
    expect(html).toContain('Les fichiers DOCX ne sont pas affichés dans cette vue.')
    expect(html).not.toContain('Ouvrir')
  })
})
