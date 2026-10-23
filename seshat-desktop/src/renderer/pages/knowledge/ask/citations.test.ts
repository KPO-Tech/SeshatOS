import { describe, expect, it } from 'vitest'
import { splitAnswer } from './citations'

describe('splitAnswer', () => {
  it('turns numbered markers into citations and keeps the text around them', () => {
    expect(splitAnswer('Sixty days. [1] Thirty for logistics. [2]')).toEqual([
      { type: 'text', value: 'Sixty days.' },
      { type: 'cite', n: 1 },
      { type: 'text', value: ' Thirty for logistics.' },
      { type: 'cite', n: 2 }
    ])
  })

  it('holds back a marker that is still being written', () => {
    expect(splitAnswer('Sixty days. [')).toEqual([{ type: 'text', value: 'Sixty days.' }])
    expect(splitAnswer('Sixty days. [1')).toEqual([{ type: 'text', value: 'Sixty days.' }])
  })

  it('leaves text without markers alone', () => {
    expect(splitAnswer('Nothing found.')).toEqual([{ type: 'text', value: 'Nothing found.' }])
    expect(splitAnswer('')).toEqual([])
  })
})
