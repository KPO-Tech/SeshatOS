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

// The main window only ever shows the app itself. A navigation away from it (a file dropped on the window, a link that is not handled)
// would replace the whole interface, and a local page loaded there would get the preload bridge. appUrl is the address the window loads:
// the dev server in development, the renderer's index.html otherwise. Reloading the app itself, at any route, stays allowed.
export function isAppNavigation(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') {
      return target.protocol === 'file:' && decodeURIComponent(target.pathname).toLowerCase() === decodeURIComponent(app.pathname).toLowerCase()
    }
    return target.origin === app.origin
  } catch {
    return false
  }
}
