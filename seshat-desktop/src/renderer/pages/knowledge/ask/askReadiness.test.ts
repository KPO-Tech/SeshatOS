import { describe, expect, it } from 'vitest'
import { askNotices, askStop, type AskReadinessInput } from './askReadiness'

const ready: AskReadinessInput = { loading: false, collectionsFailed: false, collectionCount: 3, mode: 'standalone', canManage: true, embedder: { enabled: true, is_configured: true } }

describe('askStop', () => {
  it('says nothing while the collections load, nor when there are some', () => {
    expect(askStop({ ...ready, loading: true, collectionCount: 0 })).toBeNull()
    expect(askStop(ready)).toBeNull()
  })

  it('asks to try again when the collections could not be read, and says whose server it is', () => {
    const alone = askStop({ ...ready, collectionsFailed: true })
    expect(alone).toMatchObject({ kind: 'unavailable', action: { id: 'retry' } })
    const connected = askStop({ ...ready, collectionsFailed: true, mode: 'connected' })
    expect(connected?.title).toContain('SeshatCloud')
    expect(alone?.title).not.toContain('SeshatCloud')
  })

  it('a failure wins over an empty list', () => {
    expect(askStop({ ...ready, collectionsFailed: true, collectionCount: 0 })?.kind).toBe('unavailable')
  })

  it('offers to add a source to a person who can, and sends the others to an administrator', () => {
    expect(askStop({ ...ready, collectionCount: 0 })).toMatchObject({ kind: 'empty', action: { id: 'add-source' } })
    const member = askStop({ ...ready, collectionCount: 0, mode: 'connected', canManage: false })
    expect(member?.kind).toBe('empty')
    expect(member?.action).toBeUndefined()
    expect(member?.text).toContain('administrator')
  })
})

describe('askNotices', () => {
  it('has none when the embedding is set up, or when its settings could not be read', () => {
    expect(askNotices(ready)).toEqual([])
    expect(askNotices({ ...ready, embedder: null })).toEqual([])
  })

  it('warns that the search is by words only when no embedding model is in use', () => {
    for (const embedder of [{ enabled: false, is_configured: true }, { enabled: true, is_configured: false }]) {
      const [notice] = askNotices({ ...ready, embedder })
      expect(notice.id).toBe('no-embedder')
      expect(notice.action?.id).toBe('setup-search')
    }
  })

  it('warns when the vectors were made with another model, and offers no action to a person who cannot manage', () => {
    const [notice] = askNotices({ canManage: false, embedder: { enabled: true, is_configured: true, vectors_stale: true } })
    expect(notice.id).toBe('vectors-stale')
    expect(notice.action).toBeUndefined()
  })
})
