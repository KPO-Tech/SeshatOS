#!/usr/bin/env node
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.NO_SANDBOX = env.NO_SANDBOX || '1'

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
