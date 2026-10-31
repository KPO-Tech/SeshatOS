import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { countFiles } from './fileCount.js'

async function project(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'seshat-count-'))
  for (const file of files) {
    const path = join(root, ...file.split('/'))
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, 'x')
  }
  return root
}

test('counts the files of a folder and of its sub-folders', async () => {
  const root = await project(['a.txt', 'docs/b.md', 'docs/deep/c.pdf'])
  try {
    assert.deepEqual(await countFiles(root), { count: 3, capped: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('leaves out the folders a tool made', async () => {
  const root = await project(['a.txt', 'node_modules/pkg/index.js', '.git/HEAD', 'dist/out.js', 'src/b.ts'])
  try {
    assert.deepEqual(await countFiles(root), { count: 2, capped: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stops at the limit and says so', async () => {
  const root = await project(Array.from({ length: 30 }, (_, i) => `f${i}.txt`))
  try {
    assert.deepEqual(await countFiles(root, 10), { count: 10, capped: true })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an empty folder holds nothing, and a folder that does not exist is not an error', async () => {
  const root = await project([])
  try {
    assert.deepEqual(await countFiles(root), { count: 0, capped: false })
    assert.deepEqual(await countFiles(join(root, 'missing')), { count: 0, capped: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not follow a link out of the folder', async (t) => {
  const outside = await project(['x/1.txt', 'x/2.txt', 'x/3.txt'])
  const root = await project(['a.txt'])
  try {
    try {
      await symlink(outside, join(root, 'link'), 'dir')
    } catch {
      t.skip('cannot create a symbolic link here')
      return
    }
    assert.deepEqual(await countFiles(root), { count: 1, capped: false })
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
