import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, oversizedMessage } from './attachmentTypes'

describe('oversizedMessage', () => {
  it('names the file, its size and the limit', () => {
    expect(oversizedMessage('big.zip', MAX_UPLOAD_BYTES + 1)).toBe('big.zip is 101 MB; the limit is 100 MB per file.')
  })
})
