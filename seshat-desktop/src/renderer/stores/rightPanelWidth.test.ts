import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from './ui'

const widthOfFirstColumn = () => useUIStore.getState().rightColumns[0]?.width ?? 0

describe('the width a right panel opens at', () => {
  beforeEach(() => {
    useUIStore.setState({ rightColumns: [], windowWidth: 1920, sidebarCollapsed: false })
  })

  it('opens a tool that is text to read as wide as a document, wider than a process view', () => {
    useUIStore.getState().openRightPanel({ kind: 'computer', title: 'Session', sessionId: 's1', focusToolId: 't1' })
    const process = widthOfFirstColumn()

    useUIStore.setState({ rightColumns: [] })
    useUIStore.getState().openRightPanel({ kind: 'computer', title: 'Session', sessionId: 's1', focusToolId: 't1', readable: true })
    const readable = widthOfFirstColumn()

    expect(readable).toBeGreaterThan(process)
  })

  it('does not keep the flag on the panel it opens', () => {
    useUIStore.getState().openRightPanel({ kind: 'computer', title: 'Session', sessionId: 's1', readable: true })
    expect(useUIStore.getState().rightColumns[0].panels[0]).not.toHaveProperty('readable')
  })

  it('widens a panel that is already open when a readable tool is opened in it', () => {
    useUIStore.getState().openRightPanel({ kind: 'computer', title: 'Session', sessionId: 's1' })
    const before = widthOfFirstColumn()
    useUIStore.getState().openRightPanel({ kind: 'computer', title: 'Session', sessionId: 's1', focusToolId: 't1', readable: true })
    expect(widthOfFirstColumn()).toBeGreaterThan(before)
  })
})
