import { describe, expect, it } from 'vitest'
import { gitFolder } from './gitFolder'

describe('gitFolder', () => {
  it('prefers the project the person picked to the folder of the session', () => {
    expect(gitFolder({ projectPath: 'D:/proj', workspacePath: 'C:/cfg/workspaces/1' })).toBe('D:/proj')
  })

  it('falls back to the folder of the session, and to nothing', () => {
    expect(gitFolder({ projectPath: '', workspacePath: 'C:/cfg/workspaces/1' })).toBe('C:/cfg/workspaces/1')
    expect(gitFolder({})).toBeUndefined()
    expect(gitFolder(undefined)).toBeUndefined()
  })
})
