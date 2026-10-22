import { describe, expect, it } from 'vitest'
import { absoluteLocalPath } from './attachmentPreview'
import type { ChatAttachment } from './attachmentTypes'

const file = (local_path?: string): ChatAttachment => ({ id: 'f', filename: 'a.png', local_path, upload_status: 'uploaded' })

describe('absoluteLocalPath', () => {
  it('keeps a Windows or POSIX absolute path', () => {
    expect(absoluteLocalPath(file('C:\\Users\\me\\a.png'))).toBe('C:\\Users\\me\\a.png')
    expect(absoluteLocalPath(file('D:/work/a.png'))).toBe('D:/work/a.png')
    expect(absoluteLocalPath(file('/home/me/a.png'))).toBe('/home/me/a.png')
  })

  it('drops the path the server reports relative to its uploads folder', () => {
    expect(absoluteLocalPath(file('uploads\\images\\a.png'))).toBeUndefined()
    expect(absoluteLocalPath(file('uploads/images/a.png'))).toBeUndefined()
    expect(absoluteLocalPath(file(undefined))).toBeUndefined()
  })
})
