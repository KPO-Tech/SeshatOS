// One connected account, whichever backend it comes from, in the shape the
// plugin panels render.
export type PluginAccount = {
  id: string
  label: string
  status: string
  lastError?: string
}

// Which backend a set of accounts belongs to; drives what "disconnect" calls.
export type AccountOrigin = 'cloud' | 'inbox' | 'knowledge'

export function isHealthy(account: PluginAccount): boolean {
  return !account.lastError && account.status !== 'error'
}
