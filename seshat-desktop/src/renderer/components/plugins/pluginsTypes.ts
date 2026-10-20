// One connected account, whichever backend it comes from, in the shape the
// plugin panels render.
export type PluginAccount = {
  id: string
  label: string
  status: string
  lastError?: string
}

export function isHealthy(account: PluginAccount): boolean {
  return !account.lastError && account.status !== 'error'
}
