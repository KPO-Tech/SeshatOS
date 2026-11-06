import { describe, expect, it } from 'vitest'
import { buildMailto, MAIL_LIMITS, parseRecipients } from './mailto'

describe('the recipients of a draft', () => {
  it('are addresses separated by commas or semicolons, and nothing else', () => {
    expect(parseRecipients('a@b.co')).toEqual(['a@b.co'])
    expect(parseRecipients(' a@b.co ; c@d.org, e@f.net ')).toEqual(['a@b.co', 'c@d.org', 'e@f.net'])
    expect(parseRecipients('')).toEqual([])
    expect(parseRecipients(undefined)).toEqual([])
  })

  it('refuse a word that is no address, a name with brackets, a header trick, or too many', () => {
    for (const bad of ['nobody', 'a@b', 'Name <a@b.co>', 'a@b.co\nBcc: x@y.zz', 'a@b.co?cc=x@y.zz', '"a"@b.co', 'a@b.co/../x']) expect(parseRecipients(bad), bad).toBeNull()
    expect(parseRecipients(Array.from({ length: MAIL_LIMITS.recipients + 1 }, (_, i) => `u${i}@b.co`).join(','))).toBeNull()
  })
})

describe('the mailto link of a draft', () => {
  it('holds the recipients, the subject and the body, each encoded', () => {
    const link = buildMailto({ to: 'agency@example.com', subject: 'Notice, flat 4B', body: 'Hello,\n\nBest regards' })
    expect(link).toBe('mailto:agency@example.com?subject=Notice%2C%20flat%204B&body=Hello%2C%0A%0ABest%20regards')
  })

  it('has no recipient when none is given, and no query when there is nothing to say', () => {
    expect(buildMailto({ subject: 'Hi' })).toBe('mailto:?subject=Hi')
    expect(buildMailto({})).toBe('mailto:')
  })

  it('is not made when an address is not one', () => {
    expect(buildMailto({ to: 'javascript:alert(1)' })).toBeNull()
    expect(buildMailto({ to: 'a@b.co,evil' })).toBeNull()
  })

  it('cannot carry a header or another scheme through the subject or the body', () => {
    const link = buildMailto({ to: 'a@b.co', subject: 'Hi\r\nBcc: x@y.zz', body: 'one\r\ntwo' }) as string
    expect(link.startsWith('mailto:a@b.co?')).toBe(true)
    expect(link).not.toMatch(/[\r\n]/)
    // The text a person wrote is data: a "&cc=" in it is encoded, not a parameter.
    const sneaky = buildMailto({ to: 'a@b.co', subject: 'x&cc=boss@corp.com', body: '&bcc=boss@corp.com' }) as string
    expect(sneaky).not.toContain('&cc=')
    expect(sneaky).not.toContain('&bcc=')
    expect(sneaky.match(/subject=/g)).toHaveLength(1)
    expect(sneaky.match(/body=/g)).toHaveLength(1)
  })

  it('is cut at the limit, from the end of the body', () => {
    const link = buildMailto({ to: 'a@b.co', subject: 's', body: 'é'.repeat(5000) }) as string
    expect(link.length).toBeLessThanOrEqual(MAIL_LIMITS.link)
    expect(link).toContain('subject=s')
  })
})
