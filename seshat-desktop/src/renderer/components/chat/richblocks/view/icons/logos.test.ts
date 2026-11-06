import { describe, expect, it } from 'vitest'
import { loadLogo, logoCandidates, peekLogo } from './iconCatalog'

describe('the larger set of logos', () => {
  it('finds a cloud service, a productivity tool or an AI product by its plain name', async () => {
    for (const name of ['aws lambda', 'AWS S3', 'azure', 'google cloud', 'slack', 'linkedin', 'microsoft', 'openai', 'gcp', 'k8s']) {
      const icon = await loadLogo(name)
      expect(icon?.kind, name).toBe('logo')
      if (icon?.kind === 'logo') {
        expect(icon.body).toContain('<')
        expect(icon.width).toBeGreaterThan(0)
      }
    }
  })

  it('keeps what it found, so that a second look is answered at once', async () => {
    await loadLogo('slack')
    expect(peekLogo('slack')?.kind).toBe('logo')
    expect(peekLogo('never asked for')).toBeUndefined()
  })

  it('gives null for a name that is no logo, and cannot be tricked by the names of an object', async () => {
    for (const name of ['no-such-logo-at-all', '__proto__', 'constructor', 'toString', '']) expect(await loadLogo(name), name).toBeNull()
  })

  it('tries a name as said, with -icon, without dashes, and through the common short names', () => {
    expect(logoCandidates('AWS Lambda')).toContain('aws-lambda')
    expect(logoCandidates('slack')).toEqual(expect.arrayContaining(['slack', 'slack-icon']))
    expect(logoCandidates('gcp')).toContain('google-cloud')
  })
})

describe('a logo that would vanish on a dark page', () => {
  it('takes the colour of the text when it is drawn only in very dark colours', async () => {
    const { followText } = await import('./iconCatalog')
    expect(followText('<path fill="#000" d="M0"/><path fill="#111111" d="M1"/>')).toBe('<path fill="currentColor" d="M0"/><path fill="currentColor" d="M1"/>')
    expect(followText('<path fill="black" d="M0"/>')).toBe('<path fill="currentColor" d="M0"/>')
  })

  it('keeps every colour of a logo that has a light one', async () => {
    const { followText } = await import('./iconCatalog')
    const body = '<path fill="#000" d="M0"/><path fill="#ff9900" d="M1"/>'
    expect(followText(body)).toBe(body)
    expect(followText('<path d="M0"/>')).toBe('<path d="M0"/>')
  })

  it('prefers the mark alone, so that the logo is a square', () => {
    expect(logoCandidates('slack')[0]).toBe('slack-icon')
  })
})
