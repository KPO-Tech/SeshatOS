import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProject, searchFiles } from './projectScan.js'

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'seshat-scan-'))
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, ...file.split('/'))
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content)
  }
  return root
}

test('scans a project: how many files, how much they weigh, and when the folder was made', async () => {
  const root = await project({ 'a.txt': '12345', 'docs/b.md': '1234567890', 'docs/deep/c.py': 'x' })
  try {
    const scan = await scanProject(root)
    assert.equal(scan.count, 3)
    assert.equal(scan.capped, false)
    assert.equal(scan.bytes, 16)
    assert.ok(scan.createdMs > 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('names the files changed last, newest first, and no more than asked', async () => {
  const root = await project({ 'old.txt': 'o', 'mid.txt': 'm', 'new.txt': 'n', 'node_modules/pkg/index.js': 'x' })
  try {
    await utimes(join(root, 'old.txt'), new Date('2026-01-01'), new Date('2026-01-01'))
    await utimes(join(root, 'mid.txt'), new Date('2026-02-01'), new Date('2026-02-01'))
    await utimes(join(root, 'new.txt'), new Date('2026-03-01'), new Date('2026-03-01'))
    const scan = await scanProject(root, 2)
    assert.deepEqual(scan.recent.map((file) => file.name), ['new.txt', 'mid.txt'])
    assert.equal(scan.count, 3, 'the files of node_modules are not counted')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stops at the limit and says so', async () => {
  const root = await project(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}.txt`, 'x'])))
  try {
    const scan = await scanProject(root, 5, 8)
    assert.equal(scan.count, 8)
    assert.equal(scan.capped, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a folder that does not exist is an empty scan, not an error', async () => {
  const scan = await scanProject(join(tmpdir(), 'seshat-missing-folder-xyz'))
  assert.deepEqual(scan, { count: 0, capped: false, bytes: 0, recent: [], createdMs: 0 })
})

test('searches names, every word of the query, files and folders, nearest the root first', async () => {
  const root = await project({ 'README.md': '', 'src/model_train.py': '', 'src/models/predictor.py': '', 'notes/model.txt': '', 'node_modules/model/x.js': '' })
  try {
    const found = await searchFiles(root, 'model')
    const names = found.map((file) => file.relativePath.replace(/\\/g, '/'))
    assert.deepEqual(names.sort(), ['notes/model.txt', 'src/model_train.py', 'src/models'].sort())
    assert.ok(found.find((file) => file.name === 'models')?.isDirectory)
    assert.deepEqual((await searchFiles(root, 'model train')).map((file) => file.name), ['model_train.py'])
    assert.deepEqual(await searchFiles(root, '   '), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('gives no more results than the limit', async () => {
  const root = await project(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`data_${i}.csv`, ''])))
  try {
    assert.equal((await searchFiles(root, 'data', 10)).length, 10)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
