/**
 * What to show for the address of a source: "owner/repo" for a repository on a known host (GitHub, GitLab, Codeberg, Bitbucket), else
 * the host and the path without "www." and without a trailing slash. An address that cannot be read is shown as it is.
 */
export function sourceLabel(address: string): string {
  try {
    const url = new URL(address)
    const host = url.hostname.replace(/^www\./, '')
    const parts = url.pathname.split('/').filter(Boolean)
    if (['github.com', 'gitlab.com', 'codeberg.org', 'bitbucket.org'].includes(host) && parts.length >= 2) return `${parts[0]}/${parts[1].replace(/\.git$/, '')}`
    const path = parts.join('/')
    return path ? `${host}/${path}` : host
  } catch {
    return address
  }
}
