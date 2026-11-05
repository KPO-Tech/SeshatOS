import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { RichBlock } from '../RichBlock'
import { RichActionProvider } from '../actions/richActions'
import { blockHash } from '../forms/formStorage'

const FORM = `root = Stack([plan, exercise, score])
plan = SegmentBar([Segment("Discover", 2, "blue"), Segment("Write", 8, "green"), Segment("Correct", 5)], "min", "15 minutes")
exercise = Form([essay, count], send, "Day 1")
essay = TextArea("essay", "In my opinion...", 6)
count = Counter("essay", "words", 100, 150)
send = Submit("Correct my text", "Here is my text: {{essay}}")
score = ProgressBar(11.5, 20, "Mark")`

async function draw(language: 'en' | 'fr', options: { ask?: boolean } = {}) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  const block = createElement(RichBlock, { code: FORM, streaming: false, fallback: null })
  const bridge = createElement(RichActionProvider, { ask: options.ask === false ? undefined : () => undefined, busy: false, children: block })
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, bridge))
}

describe('the forms of an answer, drawn', () => {
  it('draws the exercise: a box to write in, the count of words, and a button that waits for the text', async () => {
    const html = await draw('en')
    expect(html).toContain('<textarea')
    expect(html).toContain('placeholder="In my opinion..."')
    expect(html).toContain('0 words (100-150)')
    expect(html).toContain('Correct my text')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Fill in the fields to continue\."/)
  })

  it('draws the bars: the parts of the session with their figures, and the mark', async () => {
    const html = await draw('en')
    expect(html).toContain('15 minutes')
    expect(html).toContain('2 min')
    expect(html).toContain('Discover')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="11.5"')
  })

  it('says in French what the button is waiting for', async () => {
    const html = await draw('fr')
    expect(html).toContain('Remplissez les champs pour continuer.')
    expect(html).not.toContain('chat.richblocks')
  })

  it('keeps what is typed under a key of the text of the block, once it is complete', () => {
    expect(blockHash(FORM)).toBe(blockHash(FORM))
    expect(blockHash(FORM)).not.toBe(blockHash(`${FORM} `))
  })
})
