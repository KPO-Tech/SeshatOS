import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { AvailableSkillCard } from './SkillCard'
import { categoryLabel } from './skillIcons'

async function instanceIn(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return instance
}

async function drawCard(language: 'en' | 'fr') {
  const instance = await instanceIn(language)
  const card = createElement(AvailableSkillCard, {
    name: 'pdf-tools',
    description: 'Reads PDFs',
    icon: 'bolt',
    url: 'https://github.com/acme/pdf-tools',
    skillCount: 3,
    needs: ['python'],
    busy: false,
    moreItems: [],
    onInstall: () => undefined,
    onViewSource: () => undefined
  })
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, card))
}

describe('Skills in each language', () => {
  it('draws a skill card in French and keeps the word Skills', async () => {
    const html = await drawCard('fr')
    expect(html).toContain('Installer')
    expect(html).toContain('Nécessite')
    expect(html).toContain('3 skills')
    expect(html).not.toContain('Needs')
    expect(html).not.toContain('skills:')
  })

  it('draws a skill card in English', async () => {
    const html = await drawCard('en')
    expect(html).toContain('Install')
    expect(html).toContain('Needs')
    expect(html).toContain('3 skills')
  })

  it('names the categories in the language of the screen, and leaves an unknown one as it is', async () => {
    const fr = (await instanceIn('fr')).t
    const en = (await instanceIn('en')).t
    expect(categoryLabel('Databases', fr)).toBe('Bases de données')
    expect(categoryLabel('Databases', en)).toBe('Databases')
    expect(categoryLabel('Other', fr)).toBe('Autre')
    expect(categoryLabel('Something else', fr)).toBe('Something else')
  })
})
