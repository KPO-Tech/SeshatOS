// Undici (Node's fetch) throws a TypeError for a network error raised before
// a response is received (WHATWG fetch spec) — mirroring the browser fetch
// contract, and the SAME check the renderer's browser-fetch fallback path
// already relies on.
//
// A connection that dies mid-stream — after fetch() already resolved with a
// Response and headers, while the body is still being read (e.g. a long
// silent stretch during a slow tool call ends with the socket being reset or
// timing out) — is a different error shape entirely: a plain Error, not a
// TypeError, typically with `.code` UND_ERR_SOCKET/ECONNRESET/
// UND_ERR_BODY_TIMEOUT and a message like "terminated". A real production
// incident hit exactly this: a 40+ minute turn's connection died mid-stream,
// surfaced as "terminated", and — because that error isn't a TypeError — was
// classified as non-retryable, so no reconnect was ever attempted even
// though the retry machinery exists and was designed to handle precisely
// this. Both shapes are the same underlying class of failure (the
// connection died, not the application), so both are recognized here.
const MID_STREAM_RETRYABLE_CODES = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
])
const MID_STREAM_RETRYABLE_MESSAGES = ['terminated', 'other side closed', 'socket hang up']

export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  if (code && MID_STREAM_RETRYABLE_CODES.has(code)) return true
  const message = error.message.toLowerCase()
  return MID_STREAM_RETRYABLE_MESSAGES.some((needle) => message.includes(needle))
}
