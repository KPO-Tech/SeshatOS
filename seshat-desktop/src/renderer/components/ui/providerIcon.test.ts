import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProviderIcon } from './ProviderIcon'

describe('the icon of a provider', () => {
  it('draws the mark of FreeLLMAPI, not the two letters given to a provider that has none', () => {
    const html = renderToStaticMarkup(createElement(ProviderIcon, { provider: 'freellmapi' }))
    expect(html).toContain('<circle')
    expect(html).not.toContain('<text')
  })

  it('still gives the two letters to a provider it does not know', () => {
    expect(renderToStaticMarkup(createElement(ProviderIcon, { provider: 'unknownvendor' }))).toContain('UN')
  })
})
