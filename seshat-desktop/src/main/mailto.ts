// The only way a mail application is opened from the chat: a draft written by the agent and edited by the person, handed to the main
// process as three pieces of text, and turned into a mailto: link here, never in the renderer. shell.openExternal stays closed to every
// scheme but http and https (see url-safety.ts): this is a separate door that builds its own link from checked parts, so that nothing a
// model wrote can name another scheme, another header or a second recipient it did not show.

export type MailDraft = { to?: string; subject?: string; body?: string }

/** At most this many characters of subject and of body, and of the whole link: mail applications cut a longer one. */
export const MAIL_LIMITS = { subject: 200, body: 1800, recipients: 5, link: 2000 } as const

const ADDRESS = /^[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u

/** The addresses of a text of recipients (separated by commas or semicolons), or null when one of them is not an address. */
export function parseRecipients(text: string | undefined): string[] | null {
  const parts = (text ?? '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length > MAIL_LIMITS.recipients) return null
  return parts.every((part) => ADDRESS.test(part)) ? parts : null
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** The mailto: link of a draft, or null when it cannot be made safely (an address that is none). */
export function buildMailto(draft: MailDraft): string | null {
  const recipients = parseRecipients(draft.to)
  if (recipients === null) return null
  const subject = String(draft.subject ?? '').replace(CONTROL, '').replace(/[\r\n]+/g, ' ').trim().slice(0, MAIL_LIMITS.subject)
  let body = String(draft.body ?? '').replace(CONTROL, '').replace(/\r\n?/g, '\n').slice(0, MAIL_LIMITS.body)
  const make = (text: string) => {
    const query = [subject ? `subject=${encodeURIComponent(subject)}` : '', text ? `body=${encodeURIComponent(text)}` : ''].filter(Boolean).join('&')
    return `mailto:${recipients.map((address) => encodeURIComponent(address).replace(/%40/g, '@')).join(',')}${query ? `?${query}` : ''}`
  }
  let link = make(body)
  // A link that is too long loses the end of the body, not its beginning.
  while (link.length > MAIL_LIMITS.link && body.length > 0) {
    body = body.slice(0, Math.max(0, body.length - Math.ceil((link.length - MAIL_LIMITS.link) / 3) - 10))
    link = make(body)
  }
  return link.length > MAIL_LIMITS.link ? null : link
}
