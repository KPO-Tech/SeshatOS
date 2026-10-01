import { session } from 'electron'
import { resolveBackendOrigin } from './runtime'

// Defense-in-depth only - nodeIntegration/contextIsolation/sandbox are the
// real boundary. This just shrinks the blast radius of a future renderer-side
// injection bug (e.g. a markdown-rendering XSS) by blocking exfiltration and
// arbitrary script/asset loading, even though nothing in this app should ever
// need to reach outside its own bundle.
//
// - script-src/style-src/img-src/font-src 'self': the packaged renderer is
//   entirely local files (out/renderer). style-src also needs 'unsafe-inline'
//   because React's `style={{...}}` props render as inline style attributes
//   throughout the app (virtualized list positioning, etc.) - locking that
//   down would need a full inline-style-to-class refactor, not a CSP problem.
// - img-src additionally allows data: (attachment/doc-preview thumbnails are
//   base64 data URLs), file: (local file previews staged before upload),
//   blob: (URL.createObjectURL previews), and DuckDuckGo's favicon-only
//   endpoint for compact web-search source icons.
// - font-src additionally allows data: - KaTeX's bundled fonts are inlined as
//   base64 in its stylesheet.
// - connect-src 'self' only: the renderer never calls the backend directly -
//   every HTTP/SSE call goes through the main process over IPC (see
//   ipc/backend.ts) precisely so the renderer doesn't need network access at
//   all in the packaged app.
// - worker-src 'self': the PDF preview's pdf.worker is bundled and loaded
//   same-origin (see lib/pdfPreview.ts).
// - object-src 'none', base-uri/form-action 'none': no plugins, no
//   <base> retargeting, no form submissions exist in this app.
// - frame-src is the backend origin only, not 'none' - the artifact-preview
//   right panel embeds a sandboxed <iframe> (sandbox="allow-scripts", no
//   allow-same-origin) pointed at the backend's own /artifacts/preview/{id}
//   endpoint (see ArtifactPreviewPanel.tsx). That response carries its own,
//   separately-scoped CSP (see artifactPreviewOrigin handling below) - this
//   directive only controls whether the frame is allowed to load AT ALL, not
//   what runs inside it once loaded.
function buildContentSecurityPolicy(backendOrigin: string) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: file: blob: https://icons.duckduckgo.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-src ${backendOrigin}`,
  ].join('; ')
}

// Only the packaged app (loadFile) gets the strict CSP. Dev mode
// (ELECTRON_RENDERER_URL set, pointing at the electron-vite dev server) needs
// HMR's inline bootstrap script and eval-based module reloading, which this
// policy would break - the CSP's value here is protecting what real users
// run, not the dev loop.
export function applyContentSecurityPolicy() {
  if (process.env.ELECTRON_RENDERER_URL) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // resolveBackendOrigin() is read fresh on every response rather than
    // once at startup - in a packaged app the sidecar's actual port isn't
    // known until after it starts (see backend-process.ts's
    // setDynamicBackendOrigin), which happens after this handler is
    // registered but before any real navigation/fetch completes.
    const backendOrigin = resolveBackendOrigin()

    // The artifact-preview endpoint sets its own, deliberately more
    // permissive CSP (inline script/style execution - the whole point of
    // previewing agent-written HTML) scoped to just that one response - see
    // artifactPreviewCSP in seshat-backend/internal/api/artifacts.go. Don't
    // clobber it with the app's own strict policy the way every other
    // response gets.
    if (details.url.startsWith(`${backendOrigin}/api/v1/artifacts/preview/`)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildContentSecurityPolicy(backendOrigin)],
      },
    })
  })
}
