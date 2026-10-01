export function errorHeading(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('raw_status_code":429')) {
    return 'Provider rate limit'
  }
  if (lower.includes('tier_not_allowed') || lower.includes('not available in your subscription') || lower.includes('raw_status_code":403')) {
    return 'Provider access error'
  }
  if (lower.includes('timeout') || lower.includes('failed to send request') || lower.includes('failed to reach')) {
    return 'Connection error'
  }
  return 'Provider error'
}
