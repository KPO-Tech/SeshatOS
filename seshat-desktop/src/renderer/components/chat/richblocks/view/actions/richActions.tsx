import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { UiAction } from '../../lang/types'

export type RichActionBridge = {
  /** Sends a message as the user. Absent where an answer is shown without a conversation under it. */
  ask?: (text: string) => void
  /** Opens a file named by an answer inside the app. Absent where there is no panel to show it: the system opens it. */
  openFile?: (path: string) => void
  /** True while an answer is being written: a follow-up would interrupt it. */
  busy: boolean
}

const RichActionContext = createContext<RichActionBridge>({ busy: false })

export function RichActionProvider({ ask, openFile, busy, children }: RichActionBridge & { children: ReactNode }) {
  const value = useMemo(() => ({ ask, openFile, busy }), [ask, openFile, busy])
  return <RichActionContext.Provider value={value}>{children}</RichActionContext.Provider>
}

export const useRichActionBridge = () => useContext(RichActionContext)

export function readAction(value: unknown): UiAction | null {
  if (typeof value !== 'object' || value === null) return null
  const action = value as Partial<UiAction>
  return action.kind === 'action' && Array.isArray(action.args) ? (action as UiAction) : null
}

/** What an action can do here, and why not when it cannot. */
export function actionState(action: UiAction | null, bridge: RichActionBridge): { enabled: boolean; why?: string } {
  if (!action) return { enabled: false, why: 'This action could not be read' }
  if (action.name !== 'Ask') return { enabled: true }
  if (!bridge.ask) return { enabled: false, why: 'Open the conversation to ask' }
  if (bridge.busy) return { enabled: false, why: 'Wait for the answer to finish' }
  return { enabled: true }
}

export function runAction(action: UiAction | null, bridge: RichActionBridge): void {
  if (!action || !actionState(action, bridge).enabled) return
  const [first] = action.args
  if (action.name === 'Ask') bridge.ask?.(String(first))
  else if (action.name === 'OpenUrl') void window.seshat?.openExternal?.(String(first))
  else if (bridge.openFile) bridge.openFile(String(first))
  else void window.seshat?.openPath?.(String(first))
}
