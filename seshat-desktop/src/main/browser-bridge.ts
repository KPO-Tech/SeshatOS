import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

type BrowserBridgeOptions = {
  port: number
  resolveSessionTarget: (sessionId: string) => Promise<string>
}

// A tiny local-only HTTP server the Go backend calls into to ask "give me
// the desktop-visible browser tab for session X" (see
// resolveElectronBrowserSessionTarget in seshat-backend, and
// Config.TargetResolver in the seshat SDK's internal/web/browser package).
// This is the one piece of plumbing that lets an agent's browser_* tool
// calls attach to the exact tab the user is already looking at instead of an
// invisible incognito one. Loopback-only, no auth token - same security
// posture as the CDP debug port this app already exposes on 127.0.0.1.
export function createBrowserBridgeServer({ port, resolveSessionTarget }: BrowserBridgeOptions) {
  let server: Server | null = null

  async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    const remoteAddress = req.socket.remoteAddress
    if (!remoteAddress || !LOOPBACK_ADDRESSES.has(remoteAddress)) {
      res.writeHead(403).end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method !== 'GET' || url.pathname !== '/session-target') {
      res.writeHead(404).end()
      return
    }
    const sessionId = url.searchParams.get('sessionId')?.trim()
    if (!sessionId) {
      res.writeHead(400).end()
      return
    }
    try {
      const targetId = await resolveSessionTarget(sessionId)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ target_id: targetId }))
    } catch (error) {
      console.warn('[browser-bridge] resolveSessionTarget failed', error)
      res.writeHead(500).end()
    }
  }

  return {
    start() {
      if (server) return
      server = createServer((req, res) => {
        void handleRequest(req, res).catch((error) => {
          console.warn('[browser-bridge] request failed', error)
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
      })
      server.on('error', (error) => {
        console.warn('[browser-bridge] server error', error)
      })
      server.listen(port, '127.0.0.1')
    },
    stop() {
      server?.close()
      server = null
    },
  }
}
