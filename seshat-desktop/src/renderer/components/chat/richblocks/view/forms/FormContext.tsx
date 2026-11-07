import { createContext, useContext } from 'react'

/** The state of the Form around a field: what was typed, whether it was sent (the fields are then read-only). */
export type FormState = {
  valueOf: (name: string) => string
  setValue: (name: string, value: string) => void
  locked: boolean
}

export const FormContext = createContext<FormState | null>(null)

export const useForm = () => useContext(FormContext)

/** A key for the block being drawn, once it is complete: what the reader typed is kept under it. Absent while the block streams. */
export const RichBlockKeyContext = createContext<string | undefined>(undefined)

export const useRichBlockKey = () => useContext(RichBlockKeyContext)
