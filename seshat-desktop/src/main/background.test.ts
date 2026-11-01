import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, Menu: {}, Notification: class {}, Tray: class {}, dialog: {}, nativeImage: {} }))

import { cleanNotice, keepRunningMessage, shouldKeepRunning } from './background'

describe('shouldKeepRunning', () => {
  it('hides the window only while work is in progress', () => {
    expect(shouldKeepRunning({ busy: 1, quitting: false, platform: 'win32' })).toBe(true)
    expect(shouldKeepRunning({ busy: 0, quitting: false, platform: 'win32' })).toBe(false)
  })

  it('lets the app quit when it was asked to', () => {
    expect(shouldKeepRunning({ busy: 3, quitting: true, platform: 'linux' })).toBe(false)
  })

  it('leaves macOS alone: closing a window never quits the app there', () => {
    expect(shouldKeepRunning({ busy: 3, quitting: false, platform: 'darwin' })).toBe(false)
  })
})

describe('keepRunningMessage', () => {
  it('counts the tasks', () => {
    expect(keepRunningMessage(1).body).toMatch(/^1 task is still running/)
    expect(keepRunningMessage(2).body).toMatch(/^2 tasks are still running/)
  })
})

describe('cleanNotice', () => {
  it('keeps a title, a short body and a route inside the app', () => {
    expect(cleanNotice({ title: ' Done ', body: 'It is ready', route: '/skills' })).toEqual({ title: 'Done', body: 'It is ready', route: '/skills' })
  })

  it('refuses a notice with no title', () => {
    expect(cleanNotice({ body: 'x' })).toBeNull()
    expect(cleanNotice({ title: '  ' })).toBeNull()
  })

  it('drops a route that leaves the app', () => {
    expect(cleanNotice({ title: 'a', route: 'https://example.com' })?.route).toBe('')
    expect(cleanNotice({ title: 'a', route: '//example.com' })?.route).toBe('')
  })

  it('cuts texts that are too long', () => {
    const notice = cleanNotice({ title: 'a'.repeat(500), body: 'b'.repeat(900) })
    expect(notice?.title.length).toBe(120)
    expect(notice?.body.length).toBe(300)
  })
})
