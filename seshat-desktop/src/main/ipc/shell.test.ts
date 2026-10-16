import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { registerShellHandlers, stopAllShellSessions } from './shell.js'

type Handler = (event: IpcMainInvokeEvent, payload?: unknown) => unknown
type Sent = { channel: string; payload: { id?: string; data?: string } }

// A minimal ipcMain that only records handlers, so the whole pty path runs
// with no Electron runtime. trusted-sender.ts imports electron as a type only
// and requires a file:// sender when ELECTRON_RENDERER_URL is unset, which is
// the case in this process.
function fakeIpcMain() {
  const handlers = new Map<string, Handler>()
  const ipcMain = {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    },
  } as unknown as IpcMain
  return {
    ipcMain,
    call: (event: IpcMainInvokeEvent, channel: string, payload?: unknown) => handlers.get(channel)!(event, payload),
  }
}

function fakeEvent(url = 'file:///app/index.html') {
  const sent: Sent[] = []
  const event = {
    senderFrame: { url },
    sender: {
      isDestroyed: () => false,
      send: (channel: string, payload: Sent['payload']) => sent.push({ channel, payload }),
    },
  } as unknown as IpcMainInvokeEvent
  return { event, sent }
}

function ptyOutput(sent: Sent[]): string {
  return sent.filter((message) => message.channel === 'shell:data').map((message) => message.payload.data ?? '').join('')
}

async function waitForOutput(sent: Sent[], needle: string, timeoutMs = 25_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let output = ptyOutput(sent)
  while (!output.includes(needle) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    output = ptyOutput(sent)
  }
  return output
}

test('runs a command in a pty and streams its output back', async () => {
  const { ipcMain, call } = fakeIpcMain()
  registerShellHandlers(ipcMain)
  const { event, sent } = fakeEvent()

  try {
    const started = (await call(event, 'shell:start', { id: 'shell-test', cwd: tmpdir(), cols: 80, rows: 24 })) as {
      shell: string
      cwd: string
    }
    assert.ok(started.shell.length > 0, 'expected a shell label')
    assert.equal(started.cwd, tmpdir())

    // The echoed command text spells 'PTY'+'OK', quotes and plus signs
    // included, so a contiguous PTYOK can only come from the program's own
    // output rather than from the pty echoing what was typed.
    await call(event, 'shell:write', { id: 'shell-test', data: `node -e "process.stdout.write('PTY'+'OK'+String.fromCharCode(10))"\r` })

    const output = await waitForOutput(sent, 'PTYOK')
    assert.ok(output.includes('PTYOK'), `expected PTYOK in pty output, got ${JSON.stringify(output.slice(0, 400))}`)
  } finally {
    await call(event, 'shell:stop', 'shell-test')
    stopAllShellSessions()
  }
})

test('refuses a shell whose directory does not exist', async () => {
  const { ipcMain, call } = fakeIpcMain()
  registerShellHandlers(ipcMain)
  const { event } = fakeEvent()

  await assert.rejects(async () => {
    await call(event, 'shell:start', { id: 'shell-missing', cwd: join(tmpdir(), 'seshat-shell-missing-dir'), cols: 80, rows: 24 })
  })
})

test('refuses a sender that is not the app itself', async () => {
  const { ipcMain, call } = fakeIpcMain()
  registerShellHandlers(ipcMain)
  const { event } = fakeEvent('https://example.com/')

  await assert.rejects(async () => {
    await call(event, 'shell:start', { id: 'shell-untrusted', cwd: tmpdir(), cols: 80, rows: 24 })
  })
})
