#!/usr/bin/env node
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.NO_SANDBOX = env.NO_SANDBOX || '1'

// `--edition=next` switches on the features the public edition hides (see src/renderer/lib/edition.ts).
const edition = process.argv.find((arg) => arg.startsWith('--edition='))?.slice('--edition='.length)
if (edition) env.VITE_SESHAT_EDITION = edition

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(command, ['electron-vite', 'dev'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
