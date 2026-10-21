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

export type ErrorPresentation = {
  title: string
  /** What happened and what to do next, in a sentence or two. */
  hint: string
}

const PRESENTATIONS: Record<StreamErrorKind, ErrorPresentation> = {
  auth: { title: 'Provider key refused', hint: 'The provider did not accept the API key. Check it in Config, under Providers.' },
  access: { title: 'Provider access error', hint: 'The key works but its plan or region does not include this model. Pick another model or check the plan.' },
  rate_limit: { title: 'Provider rate limit', hint: 'The provider is limiting requests. Wait a moment and send again, or switch model.' },
  quota: { title: 'Provider credit exhausted', hint: 'The account has no credit left for this provider. Top it up, or switch to another provider.' },
  context_length: { title: 'Conversation too long for this model', hint: 'The conversation no longer fits the model. Compact it from the session panel, or continue with a model that has a larger window.' },
  model: { title: 'Model unavailable', hint: 'The provider does not serve this model. Choose another one from the model selector.' },
  timeout: { title: 'The provider took too long', hint: 'No answer came in time. Send again; if it keeps happening, try another model.' },
  network: { title: 'Connection error', hint: 'The provider could not be reached. Check the connection (or the local model server) and send again.' },
  provider: { title: 'Provider error', hint: 'The provider failed on its side. Send again in a moment, or switch model.' },
  invalid_request: { title: 'Request refused', hint: 'The provider rejected the request as invalid. Details are below.' },
  internal: { title: 'Something went wrong', hint: 'Details are below. Sending again may work.' },
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

export function errorPresentation(message: string, kind?: string): ErrorPresentation {
  return PRESENTATIONS[isKind(kind) ? kind : kindFromMessage(message)]
}

/** The markdown shown in the conversation for a failed turn: title, what to do, then the provider's own words. */
export function errorMarkdown(message: string, kind?: string): string {
  const { title, hint } = errorPresentation(message, kind)
  return `> ${title}\n\n${hint}\n\n\`\`\`\n${message}\n\`\`\``
}
