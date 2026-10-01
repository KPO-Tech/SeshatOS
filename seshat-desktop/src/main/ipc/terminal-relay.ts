import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Socket, connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { URL } from 'node:url'
import { resolveBackendOrigin } from '../runtime'
import { getStoredAuthToken } from './backend'
import { assertTrustedSender } from './trusted-sender'

// Bridges seshat-backend's TerminalRelay (internal/query/terminal_relay.go)
// to a real, visible subprocess on this machine: when a session's terminal
// panel is open, the engine's bash tool routes commands here instead of its
// usual Docker/local sandboxed execution (see SDKRuntime.applyRemoteExecutor
// and Settings > Environment's sandbox mode) - the user watches the agent's
// commands run for real, live, as they happen. Ported from
// legacy/seshat-desktop-v1's identical implementation, which already speaks
// this exact backend protocol.

type TerminalCommand = {
  id: string
  command: string
  cwd?: string
}

type TerminalRelay = {
  sessionId: string
  socket: Socket
  webContents: WebContents
  connected: boolean
}

type NodeBuffer = Buffer<ArrayBufferLike>

const TERMINAL_EVENT_CHANNEL = 'terminal-relay:event'

const relays = new Map<string, TerminalRelay>()

export function registerTerminalRelayHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('terminal-relay:connect', async (event, sessionId: string) => {
    assertTrustedSender(event)
    const id = String(sessionId || '').trim()
    if (!id) throw new Error('Session id is required')

    const existing = relays.get(id)
    if (existing && !existing.socket.destroyed && existing.webContents.id === event.sender.id) {
      return { ok: true, connected: existing.connected }
    }

    await stopRelay(id)
    const token = await getStoredAuthToken()
    if (!token) throw new Error('Authentication required')

    const relay = await openRelay(id, token, event)
    relays.set(id, relay)
    sendEvent(relay, { type: 'connected' })
    return { ok: true, connected: true }
  })

  ipcMain.handle('terminal-relay:disconnect', async (event, sessionId: string) => {
    assertTrustedSender(event)
    await stopRelay(String(sessionId || '').trim())
  })

  ipcMain.handle('terminal-relay:status', (event, sessionId: string) => {
    assertTrustedSender(event)
    const relay = relays.get(String(sessionId || '').trim())
    return { connected: Boolean(relay && relay.connected && !relay.socket.destroyed) }
  })
}

// Disconnects every active relay - called on app quit so a lingering
// subprocess never outlives the window (mirrors browserPanel.destroy()).
export function stopAllTerminalRelays(): void {
  for (const sessionId of Array.from(relays.keys())) {
    void stopRelay(sessionId)
  }
}

async function openRelay(sessionId: string, token: string, event: IpcMainInvokeEvent): Promise<TerminalRelay> {
  const socket = await openWebSocketSocket(sessionId, token)
  const relay: TerminalRelay = { sessionId, socket, webContents: event.sender, connected: true }
  let buffer: NodeBuffer = Buffer.alloc(0)

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    const parsed = readFrames(buffer)
    buffer = parsed.remaining
    parsed.frames.forEach((frame) => handleFrame(relay, frame))
  })
  socket.on('error', (error) => {
    sendEvent(relay, { type: 'error', message: error.message })
  })
  socket.on('close', () => {
    relay.connected = false
    if (relays.get(sessionId) === relay) relays.delete(sessionId)
    sendEvent(relay, { type: 'disconnected' })
  })

  return relay
}

function openWebSocketSocket(sessionId: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const origin = new URL(resolveBackendOrigin())
    const secure = origin.protocol === 'https:'
    const port = Number(origin.port || (secure ? 443 : 80))
    const host = origin.hostname
    const key = randomBytes(16).toString('base64')
    const path = `/api/v1/terminal/ws/${encodeURIComponent(sessionId)}`
    const socket = secure ? tlsConnect({ host, port }) : netConnect({ host, port })
    let buffer = Buffer.alloc(0)

    socket.once('error', reject)
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: ${origin.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        `Authorization: Bearer ${token}`,
        '',
        ''
      ].join('\r\n'))
    })

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return

      const header = buffer.subarray(0, headerEnd).toString('utf-8')
      const rest = Buffer.from(buffer.subarray(headerEnd + 4))
      socket.off('data', onData)
      socket.off('error', reject)

      if (!/^HTTP\/1\.1 101\b/.test(header)) {
        socket.destroy()
        reject(new Error(header.split('\r\n')[0] || 'Terminal relay rejected'))
        return
      }

      if (rest.length > 0) socket.unshift(rest)
      resolve(socket)
    }
    socket.on('data', onData)
  })
}

function handleFrame(relay: TerminalRelay, frame: { opcode: number; payload: NodeBuffer }) {
  if (frame.opcode === 8) {
    relay.socket.end()
    return
  }
  if (frame.opcode === 9) {
    relay.socket.write(encodeFrame(frame.payload, 10))
    return
  }
  if (frame.opcode !== 1) return

  try {
    const command = JSON.parse(frame.payload.toString('utf-8')) as TerminalCommand
    void runCommand(relay, command)
  } catch (err) {
    sendEvent(relay, { type: 'error', message: err instanceof Error ? err.message : 'Invalid terminal command' })
  }
}

async function runCommand(relay: TerminalRelay, request: TerminalCommand) {
  const command = String(request.command || '').trim()
  const cwd = String(request.cwd || process.cwd())
  if (!request.id || !command) return

  const start = Date.now()
  let stdout = ''
  let stderr = ''
  sendEvent(relay, { type: 'command_start', commandId: request.id, command, cwd })

  const shell = shellCommand(command)
  const child = spawn(shell.command, shell.args, {
    cwd,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    stdout += text
    sendEvent(relay, { type: 'data', commandId: request.id, stream: 'stdout', data: text })
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    stderr += text
    sendEvent(relay, { type: 'data', commandId: request.id, stream: 'stderr', data: text })
  })
  child.on('error', (error) => {
    stderr += error.message
    sendEvent(relay, { type: 'error', commandId: request.id, message: error.message })
  })
  child.on('close', (code) => {
    const exitCode = typeof code === 'number' ? code : 1
    const durationMs = Date.now() - start
    relay.socket.write(encodeFrame(Buffer.from(JSON.stringify({
      id: request.id,
      stdout,
      stderr,
      exit_code: exitCode,
      cwd
    }), 'utf-8')))
    sendEvent(relay, { type: 'command_end', commandId: request.id, command, cwd, exitCode, durationMs })
  })
}

function shellCommand(command: string) {
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', command] }
  }
  return { command: process.env.SHELL || '/bin/bash', args: ['-lc', command] }
}

function readFrames(buffer: NodeBuffer): { frames: Array<{ opcode: number; payload: NodeBuffer }>; remaining: NodeBuffer } {
  const frames: Array<{ opcode: number; payload: NodeBuffer }> = []
  let offset = 0

  while (buffer.length - offset >= 2) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    const masked = Boolean(second & 0x80)
    let length = second & 0x7f
    let headerLength = 2

    if (length === 126) {
      if (buffer.length - offset < 4) break
      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      if (buffer.length - offset < 10) break
      const largeLength = buffer.readBigUInt64BE(offset + 2)
      if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) break
      length = Number(largeLength)
      headerLength = 10
    }

    const maskLength = masked ? 4 : 0
    const frameLength = headerLength + maskLength + length
    if (buffer.length - offset < frameLength) break

    let payload: NodeBuffer = buffer.subarray(offset + headerLength + maskLength, offset + frameLength)
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4)
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]))
    }
    frames.push({ opcode, payload })
    offset += frameLength
  }

  return { frames, remaining: Buffer.from(buffer.subarray(offset)) }
}

function encodeFrame(payload: NodeBuffer, opcode = 1) {
  const mask = randomBytes(4)
  const length = payload.length
  const header = length < 126
    ? Buffer.from([0x80 | opcode, 0x80 | length])
    : length < 65536
      ? Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 0xff])
      : longHeader(opcode, length)
  const masked = Buffer.alloc(payload.length)
  payload.forEach((byte, index) => {
    masked[index] = byte ^ mask[index % 4]
  })
  return Buffer.concat([header, mask, masked])
}

function longHeader(opcode: number, length: number) {
  const header = Buffer.alloc(10)
  header[0] = 0x80 | opcode
  header[1] = 0x80 | 127
  header.writeBigUInt64BE(BigInt(length), 2)
  return header
}

function sendEvent(relay: TerminalRelay, payload: Record<string, unknown>) {
  if (relay.webContents.isDestroyed()) return
  relay.webContents.send(TERMINAL_EVENT_CHANNEL, { sessionId: relay.sessionId, ...payload })
}

async function stopRelay(sessionId: string) {
  if (!sessionId) return
  const relay = relays.get(sessionId)
  if (!relay) return
  relays.delete(sessionId)
  relay.connected = false
  relay.socket.destroy()
}
