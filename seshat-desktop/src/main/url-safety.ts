const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:'])

// shell.openExternal hands the URL to the OS, which resolves non-http(s)
// schemes via registered protocol handlers (e.g. Windows search-ms:) - a
// known Electron RCE-chain vector. Anything that reaches openExternal with
// untrusted input (window-open target from chat content, an IPC call from
// the renderer) must go through this first.
export function isExternalOpenAllowed(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}
