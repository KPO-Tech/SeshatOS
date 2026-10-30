import type { CollectionFile } from '../collections/collectionsApi'
import { listFiles } from '../collections/collectionsApi'
import { baseName } from '../collections/openDocument'
import type { KnowledgeCollection } from './useCollections'
import type { Passage } from './knowledgeSearchResults'

/** The file of a collection a passage names: by its name as the collection keeps it, folders included, else by its name alone when only one file has it. */
export function fileNamed(files: readonly Pick<CollectionFile, 'fileId' | 'name'>[], name: string): string | null {
  if (!name) return null
  const exact = files.find((file) => file.name === name)
  if (exact) return exact.fileId
  const same = files.filter((file) => baseName(file.name) === baseName(name))
  return same.length === 1 ? same[0].fileId : null
}

/**
 * The collection and the file of a passage whose search did not say where it came from (a conversation from before the search named its
 * files): found by the name of its collection and the name of its file. null when no such file is known.
 */
export async function resolvePassageFile(passage: Passage, collections: readonly KnowledgeCollection[]): Promise<{ corpusId: string; fileId: string } | null> {
  for (const collection of collections.filter((item) => item.name === passage.collection)) {
    try {
      const fileId = fileNamed(await listFiles(collection.id), passage.file)
      if (fileId) return { corpusId: collection.id, fileId }
    } catch {
      // The collection could not be read: the next one with that name, or the drawer.
    }
  }
  return null
}

/** Whether a document is still in the list a collection holds. */
export function isKept(files: readonly Pick<CollectionFile, 'fileId'>[], fileId: string): boolean {
  return files.some((file) => file.fileId === fileId)
}

/**
 * Whether a document a citation points at is still in its collection: a conversation outlives the documents it quoted. A collection that
 * cannot be read says nothing about the document, so the caller tries to open it as before.
 */
export async function stillInCollection(corpusId: string, fileId: string): Promise<boolean> {
  try {
    return isKept(await listFiles(corpusId), fileId)
  } catch {
    return true
  }
}
