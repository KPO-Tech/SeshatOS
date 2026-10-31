import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { vsCodeLocations } from './editor.js'

test('looks for Visual Studio Code where Windows installs it, for one user and for all', () => {
  const places = vsCodeLocations('win32', { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' })
  assert.deepEqual(places, [
    join('C:\\Users\\a\\AppData\\Local', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    join('C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
    join('C:\\Program Files (x86)', 'Microsoft VS Code', 'Code.exe')
  ])
})

test('skips the places the environment does not name', () => {
  assert.deepEqual(vsCodeLocations('win32', { ProgramFiles: 'C:\\Program Files' }), [join('C:\\Program Files', 'Microsoft VS Code', 'Code.exe')])
  assert.deepEqual(vsCodeLocations('win32', {}), [])
})

test('knows the application of macOS, and leaves Linux to the command on the path', () => {
  assert.deepEqual(vsCodeLocations('darwin', {}), ['/Applications/Visual Studio Code.app'])
  assert.deepEqual(vsCodeLocations('linux', {}), [])
})
