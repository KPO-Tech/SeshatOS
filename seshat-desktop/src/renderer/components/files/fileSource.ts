import { joinPath } from '@renderer/lib/projectFiles'

// Where the files of a tree come from. The tree and the viewer of files (FileTreeView, FileContentView) know nothing of the disk or of
// the backend: a project hands them a folder of the computer, a skill hands them the tree its backend answered.

export type FileEntry = { name: string; isDirectory: boolean }
export type FoundFile = { path: string; relativePath: string; name: string; isDirectory: boolean }

export type FileSource = {
  /** The path of the top folder ('' for a tree that has no real path). */
  root: string
  /** The name shown for the top folder. */
  rootName: string
  list: (path: string) => Promise<FileEntry[]>
  /** The path of an entry of a folder. */
  join: (parent: string, name: string) => string
  /** Looks for a name in the whole tree; absent when the source cannot, and the tree then shows no search. */
  search?: (text: string) => Promise<FoundFile[]>
}

// Hidden because it is not the person's files: the folder of the version control.
const HIDDEN = new Set(['.git'])

/** The files of a folder of this computer. */
export function localFileSource(rootPath: string): FileSource {
  const rootName = rootPath.split(/[\\/]+/).filter(Boolean).pop() ?? rootPath
  return {
    root: rootPath,
    rootName,
    join: joinPath,
    list: async (path) => {
      const entries = (await window.seshat?.fs?.listDirectory(path)) ?? []
      return entries.filter((entry) => !HIDDEN.has(entry.name))
    },
    search: async (text) => (await window.seshat?.fs?.searchFiles(rootPath, text)) ?? []
  }
}

/** A tree the backend has already answered in one piece: a node holds its path from the top and its children. */
export type TreeLike = { name: string; path: string; is_dir: boolean; children?: TreeLike[] }

/** The files of a tree held in memory (a skill's). */
export function treeFileSource(nodes: TreeLike[], rootName: string): FileSource {
  const children = new Map<string, TreeLike[]>([['', nodes]])
  const all: TreeLike[] = []
  const walk = (list: TreeLike[]) => {
    for (const node of list) {
      all.push(node)
      if (node.is_dir) {
        children.set(node.path, node.children ?? [])
        walk(node.children ?? [])
      }
    }
  }
  walk(nodes)
  return {
    root: '',
    rootName,
    join: (parent, name) => (parent ? `${parent}/${name}` : name),
    list: async (path) => (children.get(path) ?? []).map((node) => ({ name: node.name, isDirectory: node.is_dir })),
    search: async (text) => {
      const needle = text.toLowerCase()
      return all
        .filter((node) => node.name.toLowerCase().includes(needle))
        .slice(0, 200)
        .map((node) => ({ path: node.path, relativePath: node.path, name: node.name, isDirectory: node.is_dir }))
    }
  }
}
