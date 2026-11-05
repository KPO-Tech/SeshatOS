import type { TFunction } from 'i18next'

/** The kinds of a failed turn the backend names in the `error_kind` field of an error event (see query_errors.go). */
export type StreamErrorKind =
  | 'auth'
  | 'access'
  | 'rate_limit'
  | 'quota'
  | 'context_length'
  | 'model'
  | 'timeout'
  | 'network'
  | 'provider'
  | 'invalid_request'
  | 'internal'

/** The keys of the catalogue for the title and for what happened and what to do next, in a sentence or two. */
export type ErrorPresentation = {
  title: string
  hint: string
}

const PRESENTATIONS: Record<StreamErrorKind, ErrorPresentation> = {
  auth: { title: 'chat:chat.streaming.streamErrors.authTitle', hint: 'chat:chat.streaming.streamErrors.authHint' },
  access: { title: 'chat:chat.streaming.streamErrors.accessTitle', hint: 'chat:chat.streaming.streamErrors.accessHint' },
  rate_limit: { title: 'chat:chat.streaming.streamErrors.rate_limitTitle', hint: 'chat:chat.streaming.streamErrors.rate_limitHint' },
  quota: { title: 'chat:chat.streaming.streamErrors.quotaTitle', hint: 'chat:chat.streaming.streamErrors.quotaHint' },
  context_length: { title: 'chat:chat.streaming.streamErrors.context_lengthTitle', hint: 'chat:chat.streaming.streamErrors.context_lengthHint' },
  model: { title: 'chat:chat.streaming.streamErrors.modelTitle', hint: 'chat:chat.streaming.streamErrors.modelHint' },
  timeout: { title: 'chat:chat.streaming.streamErrors.timeoutTitle', hint: 'chat:chat.streaming.streamErrors.timeoutHint' },
  network: { title: 'chat:chat.streaming.streamErrors.networkTitle', hint: 'chat:chat.streaming.streamErrors.networkHint' },
  provider: { title: 'chat:chat.streaming.streamErrors.providerTitle', hint: 'chat:chat.streaming.streamErrors.providerHint' },
  invalid_request: { title: 'chat:chat.streaming.streamErrors.invalid_requestTitle', hint: 'chat:chat.streaming.streamErrors.invalid_requestHint' },
  internal: { title: 'chat:chat.streaming.streamErrors.internalTitle', hint: 'chat:chat.streaming.streamErrors.internalHint' },
}

function isKind(kind: string | undefined): kind is StreamErrorKind {
  return kind !== undefined && Object.prototype.hasOwnProperty.call(PRESENTATIONS, kind)
}

/** Reads the kind of an older backend that sent none from the text of the failure. */
function kindFromMessage(message: string): StreamErrorKind {
  const lower = message.toLowerCase()
  if (lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('raw_status_code":429')) return 'rate_limit'
  if (lower.includes('tier_not_allowed') || lower.includes('not available in your subscription') || lower.includes('raw_status_code":403')) return 'access'
  if (lower.includes('timeout') || lower.includes('failed to send request') || lower.includes('failed to reach')) return 'network'
  return 'provider'
}

export function errorPresentation(message: string, kind: string | undefined, t: TFunction): ErrorPresentation {
  const keys = PRESENTATIONS[isKind(kind) ? kind : kindFromMessage(message)]
  return { title: t(keys.title), hint: t(keys.hint) }
}

/** The markdown shown in the conversation for a failed turn: title, what to do, then the provider's own words. */
export function errorMarkdown(message: string, kind: string | undefined, t: TFunction): string {
  const { title, hint } = errorPresentation(message, kind, t)
  return `> ${title}\n\n${hint}\n\n\`\`\`\n${message}\n\`\`\``
}
