import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { slidersOf, startValues } from '../../lang/vars'
import type { UiNode } from '../../lang/types'
import { loadVars, saveVars } from '../forms/formStorage'
import { useRichBlockKey } from '../forms/FormContext'

/** The numbers a reader sets with the sliders of a block, by name; the formulas of the block read them. */
export type VarsState = {
  values: Record<string, number>
  set: (name: string, value: number) => void
}

const NONE: VarsState = { values: {}, set: () => undefined }

const VarsContext = createContext<VarsState>(NONE)

export const useVars = () => useContext(VarsContext)

export function VarsProvider({ root, children }: { root: UiNode; children: ReactNode }) {
  const key = useRichBlockKey()
  const sliders = useMemo(() => slidersOf(root), [root])
  const [values, setValues] = useState<Record<string, number>>(() => startValues(sliders, key ? loadVars(key) : null))
  // While the block streams its sliders may still appear: a name seen for the first time starts at its default.
  const complete = useMemo(() => startValues(sliders, values), [sliders, values])
  const set = useCallback(
    (name: string, value: number) => {
      setValues((previous) => {
        const next = { ...previous, [name]: value }
        if (key) saveVars(key, next)
        return next
      })
    },
    [key]
  )
  const state = useMemo(() => ({ values: complete, set }), [complete, set])
  if (sliders.length === 0) return <>{children}</>
  return <VarsContext.Provider value={state}>{children}</VarsContext.Provider>
}
